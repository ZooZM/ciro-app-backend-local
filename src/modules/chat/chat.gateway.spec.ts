import { Test, TestingModule } from '@nestjs/testing';
import { ChatGateway } from './chat.gateway';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { MessagesRepository } from './messages.repository';
import { PushService } from '../notifications/push.service';
import { ChatRoomsRepository } from './chat-rooms.repository';
import { StatusService } from '../status/status.service';
import { LocationBatchService } from '../map/location-batch.service';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let chatService: jest.Mocked<Partial<ChatService>>;
  let statusService: jest.Mocked<Partial<StatusService>>;
  let locationBatchService: jest.Mocked<Partial<LocationBatchService>>;

  const mockSocket = {
    id: 'test-socket-id',
    handshake: {
      headers: { authorization: 'Bearer test-token' },
      auth: { token: 'test-token' },
      query: {},
    },
    user: { userId: 'user-123', phoneNumber: '+123' },
    disconnect: jest.fn(),
    join: jest.fn(),
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  } as any;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  } as any;

  beforeEach(async () => {
    jwtService = {
      verifyAsync: jest
        .fn()
        .mockResolvedValue({ sub: 'user-123', phoneNumber: '+123' }),
    };
    chatService = {
      saveMessage: jest.fn().mockResolvedValue({ _id: 'msg-123' }),
      getUserRoomsForSocket: jest.fn().mockResolvedValue([]),
    };
    statusService = {
      createStatus: jest.fn(),
      recordView: jest.fn().mockResolvedValue(undefined),
    };
    locationBatchService = {
      onFlush: jest.fn(),
      enqueue: jest.fn(),
      cancel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ChatService, useValue: chatService },
        {
          provide: UsersService,
          useValue: {
            updateOnlineStatus: jest.fn().mockResolvedValue(undefined),
            updateLocation: jest.fn().mockResolvedValue(new Date()),
            isGhostMode: jest.fn().mockResolvedValue(false),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MessagesRepository, useValue: { softDelete: jest.fn() } },
        {
          provide: PushService,
          useValue: {
            notifyOfflineUser: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ChatRoomsRepository,
          useValue: { findById: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
        },
        { provide: StatusService, useValue: statusService },
        { provide: LocationBatchService, useValue: locationBatchService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    gateway.server = mockServer;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should verify token and set user on socket', async () => {
      await gateway.handleConnection(mockSocket);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('test-token');
      expect(mockSocket.user).toEqual({
        userId: 'user-123',
        phoneNumber: '+123',
      });
    });

    it('should disconnect if token verification fails', async () => {
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('Invalid token'),
      );
      await gateway.handleConnection(mockSocket);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleJoinRoom', () => {
    it('should join the room', async () => {
      const result = await gateway.handleJoinRoom(mockSocket, 'room-456');
      expect(mockSocket.join).toHaveBeenCalledWith('room-456');
      expect(result).toEqual({ event: 'joinedRoom', data: 'room-456' });
    });
  });

  describe('handleSendMessage', () => {
    it('emits messageSent to the sender and broadcasts newMessage to the room', async () => {
      const message = {
        _id: 'msg-123',
        createdAt: new Date(),
        content: 'Hello',
      };
      (chatService.saveMessage as jest.Mock).mockResolvedValue({
        message,
        isNew: true,
      });
      const broadcastEmit = jest.fn();
      mockSocket.broadcast = {
        to: jest.fn().mockReturnValue({ emit: broadcastEmit }),
      };
      const payload = {
        chatRoomId: 'room-456',
        content: 'Hello',
        clientMessageId: 'c1',
      };

      await gateway.handleSendMessage(mockSocket, payload);

      expect(chatService.saveMessage).toHaveBeenCalledWith('user-123', payload);
      expect(mockSocket.emit).toHaveBeenCalledWith('messageSent', {
        clientMessageId: 'c1',
        createdAt: message.createdAt,
      });
      expect(mockSocket.broadcast.to).toHaveBeenCalledWith('room-456');
      expect(broadcastEmit).toHaveBeenCalledWith('newMessage', message);
    });
  });

  describe('handleUploadStatus (T022)', () => {
    it('emits statusUploaded with the server id and clientStatusId on success', async () => {
      const createdAt = new Date('2026-06-10T00:00:00.000Z');
      (statusService.createStatus as jest.Mock).mockResolvedValue({
        status: { clientStatusId: 'client-1', id: 'server-1', createdAt },
        isNew: true,
      });
      const payload = {
        clientStatusId: 'client-1',
        contentType: 'text',
        textContent: 'hello',
      } as any;

      await gateway.handleUploadStatus(mockSocket, payload);

      expect(statusService.createStatus).toHaveBeenCalledWith(
        'user-123',
        payload,
      );
      expect(mockSocket.emit).toHaveBeenCalledWith('statusUploaded', {
        clientStatusId: 'client-1',
        id: 'server-1',
        createdAt,
      });
    });

    it('emits an error event when createStatus throws', async () => {
      (statusService.createStatus as jest.Mock).mockRejectedValue(
        new Error('audience must be a subset of mutual contacts'),
      );
      const payload = { clientStatusId: 'client-2' } as any;

      await gateway.handleUploadStatus(mockSocket, payload);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'audience must be a subset of mutual contacts',
      });
    });
  });

  describe('handleStatusViewed (T037)', () => {
    it('records the view for the authenticated user', async () => {
      await gateway.handleStatusViewed(mockSocket, 'status-1');
      expect(statusService.recordView).toHaveBeenCalledWith(
        'status-1',
        'user-123',
      );
    });

    it('does nothing when statusId is missing', async () => {
      await gateway.handleStatusViewed(mockSocket, '');
      expect(statusService.recordView).not.toHaveBeenCalled();
    });

    it('swallows errors from recordView', async () => {
      (statusService.recordView as jest.Mock).mockRejectedValue(
        new Error('boom'),
      );
      await expect(
        gateway.handleStatusViewed(mockSocket, 'status-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleShareLocation (018-snap-map-realtime, FR-006/006a)', () => {
    let usersServiceInstance: any;
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        providers: [
          ChatGateway,
          { provide: JwtService, useValue: jwtService },
          { provide: ChatService, useValue: chatService },
          {
            provide: UsersService,
            useValue: {
              updateOnlineStatus: jest.fn().mockResolvedValue(undefined),
              updateLocation: jest
                .fn()
                .mockResolvedValue(new Date('2026-06-21T00:00:00.000Z')),
              isGhostMode: jest.fn().mockResolvedValue(false),
            },
          },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          { provide: MessagesRepository, useValue: { softDelete: jest.fn() } },
          {
            provide: PushService,
            useValue: {
              notifyOfflineUser: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: ChatRoomsRepository,
            useValue: { findById: jest.fn(), findOne: jest.fn() },
          },
          {
            provide: 'REDIS_CLIENT',
            useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
          },
          { provide: StatusService, useValue: statusService },
          { provide: LocationBatchService, useValue: locationBatchService },
        ],
      }).compile();

      gateway = moduleRef.get<ChatGateway>(ChatGateway);
      gateway.server = mockServer;
      usersServiceInstance = moduleRef.get<UsersService>(UsersService);

      (chatService.getUserRoomsForSocket as jest.Mock).mockResolvedValue([
        { _id: 'room-1' },
        { _id: 'room-2' },
      ]);
      // Populates the private userRoomIds cache that handleShareLocation fans out to.
      await gateway.handleConnection(mockSocket);
    });

    it('persists immediately and enqueues into the batch for every joined room', async () => {
      await gateway.handleShareLocation(mockSocket, {
        longitude: 31.22,
        latitude: 30.05,
      });

      expect(usersServiceInstance.updateLocation).toHaveBeenCalledWith(
        'user-123',
        31.22,
        30.05,
      );
      expect(locationBatchService.enqueue).toHaveBeenCalledTimes(2);
      expect(locationBatchService.enqueue).toHaveBeenCalledWith(
        'room-1',
        'user-123',
        expect.objectContaining({
          userId: 'user-123',
          longitude: 31.22,
          latitude: 30.05,
        }),
      );
    });

    it('persists but does NOT enqueue when the user is in Ghost Mode (FR-011)', async () => {
      (usersServiceInstance.isGhostMode as jest.Mock).mockResolvedValue(true);

      await gateway.handleShareLocation(mockSocket, {
        longitude: 31.22,
        latitude: 30.05,
      });

      expect(usersServiceInstance.updateLocation).toHaveBeenCalled();
      expect(locationBatchService.enqueue).not.toHaveBeenCalled();
    });

    it('ignores malformed payloads', async () => {
      await gateway.handleShareLocation(mockSocket, {
        longitude: NaN,
        latitude: 30.05,
      });
      expect(usersServiceInstance.updateLocation).not.toHaveBeenCalled();
    });
  });

  describe('handleStopSharingLocation (018-snap-map-realtime)', () => {
    let usersServiceInstance: any;
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        providers: [
          ChatGateway,
          { provide: JwtService, useValue: jwtService },
          { provide: ChatService, useValue: chatService },
          {
            provide: UsersService,
            useValue: {
              updateOnlineStatus: jest.fn().mockResolvedValue(undefined),
              setSharingLocation: jest.fn().mockResolvedValue(undefined),
            },
          },
          { provide: ConfigService, useValue: { get: jest.fn() } },
          { provide: MessagesRepository, useValue: { softDelete: jest.fn() } },
          {
            provide: PushService,
            useValue: {
              notifyOfflineUser: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: ChatRoomsRepository,
            useValue: { findById: jest.fn(), findOne: jest.fn() },
          },
          {
            provide: 'REDIS_CLIENT',
            useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
          },
          { provide: StatusService, useValue: statusService },
          { provide: LocationBatchService, useValue: locationBatchService },
        ],
      }).compile();

      gateway = moduleRef.get<ChatGateway>(ChatGateway);
      gateway.server = mockServer;
      usersServiceInstance = moduleRef.get<UsersService>(UsersService);

      (chatService.getUserRoomsForSocket as jest.Mock).mockResolvedValue([
        { _id: 'room-1' },
        { _id: 'room-2' },
      ]);
      await gateway.handleConnection(mockSocket);
      mockServer.to.mockClear();
      mockServer.emit.mockClear();
    });

    it('persists the stopped state and broadcasts locationHidden to every joined room', async () => {
      await gateway.handleStopSharingLocation(mockSocket);

      expect(usersServiceInstance.setSharingLocation).toHaveBeenCalledWith(
        'user-123',
        false,
      );
      expect(mockServer.to).toHaveBeenCalledWith('room-1');
      expect(mockServer.to).toHaveBeenCalledWith('room-2');
      expect(mockServer.emit).toHaveBeenCalledWith('locationHidden', {
        userId: 'user-123',
      });
    });

    it('cancels any not-yet-flushed batch entry so it cannot resurrect the marker', async () => {
      await gateway.handleStopSharingLocation(mockSocket);

      expect(locationBatchService.cancel).toHaveBeenCalledWith('user-123');
    });
  });
});
