import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';
import { TranslationGateway, AuthenticatedSocket } from './translation.gateway';
import { ChatRoomsRepository } from '../chat/chat-rooms.repository';
import { TranslationManagerService } from './services/translation-manager.service';

describe('TranslationGateway', () => {
  let gateway: TranslationGateway;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let chatRoomsRepository: jest.Mocked<Partial<ChatRoomsRepository>>;
  let translationManagerService: jest.Mocked<
    Partial<TranslationManagerService>
  >;

  const mockSocket = {
    id: 'test-socket-id',
    user: { userId: 'listener-1', phoneNumber: '+123' },
    emit: jest.fn(),
  } as unknown as AuthenticatedSocket;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    chatRoomsRepository = { findOne: jest.fn() };
    translationManagerService = {
      setEventHandler: jest.fn(),
      subscribe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ChatRoomsRepository, useValue: chatRoomsRepository },
        {
          provide: TranslationManagerService,
          useValue: translationManagerService,
        },
      ],
    }).compile();

    gateway = module.get(TranslationGateway);
    gateway.server = mockServer as unknown as Server;
    mockSocket.emit = jest.fn();
  });

  it('registers itself as the manager event handler on construction', () => {
    expect(translationManagerService.setEventHandler).toHaveBeenCalledWith(
      gateway,
    );
  });

  describe('handleSubscribe', () => {
    const payload = {
      roomId: 'room-1',
      speakerId: 'speaker-1',
      targetLanguage: 'es',
    };

    it('denies an unauthenticated socket without calling the manager (FR-019)', async () => {
      const unauthenticatedSocket = {
        id: 'sock-2',
        emit: jest.fn(),
      } as unknown as AuthenticatedSocket;

      await gateway.handleSubscribe(unauthenticatedSocket, payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(unauthenticatedSocket.emit).toHaveBeenCalledWith(
        'translation:denied',
        {
          roomId: payload.roomId,
          speakerId: payload.speakerId,
          reason: 'unauthenticated',
        },
      );
      expect(translationManagerService.subscribe).not.toHaveBeenCalled();
    });

    it('denies a socket whose user is not a participant of the room (FR-019)', async () => {
      (chatRoomsRepository.findOne as jest.Mock).mockResolvedValue(null);

      await gateway.handleSubscribe(mockSocket, payload);

      expect(chatRoomsRepository.findOne).toHaveBeenCalledWith({
        _id: payload.roomId,
        participants: 'listener-1',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSocket.emit).toHaveBeenCalledWith('translation:denied', {
        roomId: payload.roomId,
        speakerId: payload.speakerId,
        reason: 'not_a_participant',
      });
      expect(translationManagerService.subscribe).not.toHaveBeenCalled();
    });

    it('emits translation:subscribed with the manager result for an authorized member', async () => {
      (chatRoomsRepository.findOne as jest.Mock).mockResolvedValue({
        _id: payload.roomId,
      });
      (translationManagerService.subscribe as jest.Mock).mockResolvedValue({
        status: 'subscribed',
        targetLanguage: 'es',
        remainingSeconds: 90,
      });

      await gateway.handleSubscribe(mockSocket, payload);

      expect(translationManagerService.subscribe).toHaveBeenCalledWith(
        'room-1',
        'speaker-1',
        'listener-1',
        'es',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSocket.emit).toHaveBeenCalledWith('translation:subscribed', {
        roomId: payload.roomId,
        speakerId: payload.speakerId,
        targetLanguage: 'es',
        remainingSeconds: 90,
      });
    });

    it('emits translation:denied with the reason returned by the manager', async () => {
      (chatRoomsRepository.findOne as jest.Mock).mockResolvedValue({
        _id: payload.roomId,
      });
      (translationManagerService.subscribe as jest.Mock).mockResolvedValue({
        status: 'denied',
        reason: 'insufficient_credits',
      });

      await gateway.handleSubscribe(mockSocket, payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSocket.emit).toHaveBeenCalledWith('translation:denied', {
        roomId: payload.roomId,
        speakerId: payload.speakerId,
        reason: 'insufficient_credits',
      });
    });

    it('emits translation_unavailable when the manager cannot open the pipeline', async () => {
      (chatRoomsRepository.findOne as jest.Mock).mockResolvedValue({
        _id: payload.roomId,
      });
      (translationManagerService.subscribe as jest.Mock).mockResolvedValue({
        status: 'unavailable',
        reason: 'service_outage',
        transient: true,
      });

      await gateway.handleSubscribe(mockSocket, payload);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockSocket.emit).toHaveBeenCalledWith('translation_unavailable', {
        roomId: payload.roomId,
        speakerId: payload.speakerId,
        reason: 'service_outage',
        transient: true,
      });
    });
  });

  describe('onTranslationUnavailable', () => {
    it('targets the affected listener via their personal room', () => {
      gateway.onTranslationUnavailable('listener-1', {
        roomId: 'room-1',
        speakerId: 'speaker-1',
        reason: 'language_undetected',
        transient: false,
      });

      expect(mockServer.to).toHaveBeenCalledWith('user:listener-1');
      expect(mockServer.emit).toHaveBeenCalledWith('translation_unavailable', {
        roomId: 'room-1',
        speakerId: 'speaker-1',
        reason: 'language_undetected',
        transient: false,
      });
    });
  });

  describe('onCreditsLow (FR-024a, SC-015)', () => {
    it('emits credits_low to the affected listener', () => {
      gateway.onCreditsLow('listener-1', {
        roomId: 'room-1',
        speakerId: 'speaker-1',
        remainingSeconds: 30,
        thresholdSeconds: 30,
      });

      expect(mockServer.to).toHaveBeenCalledWith('user:listener-1');
      expect(mockServer.emit).toHaveBeenCalledWith('credits_low', {
        roomId: 'room-1',
        speakerId: 'speaker-1',
        remainingSeconds: 30,
        thresholdSeconds: 30,
      });
    });
  });

  describe('onCreditsExhausted (FR-023, FR-024, SC-012)', () => {
    it('emits credits_exhausted to the affected listener', () => {
      gateway.onCreditsExhausted('listener-1', {
        roomId: 'room-1',
        speakerId: 'speaker-1',
        remainingSeconds: 0,
        action: 'branch_closed',
      });

      expect(mockServer.to).toHaveBeenCalledWith('user:listener-1');
      expect(mockServer.emit).toHaveBeenCalledWith('credits_exhausted', {
        roomId: 'room-1',
        speakerId: 'speaker-1',
        remainingSeconds: 0,
        action: 'branch_closed',
      });
    });
  });
});
