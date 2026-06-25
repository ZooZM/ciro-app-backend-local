import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { StatusService } from './status.service';
import { StatusRepository } from './status.repository';
import { UsersRepository } from '../users/users.repository';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { StatusContentType, StatusPrivacy } from './schemas/status.schema';

describe('StatusService', () => {
  let service: StatusService;
  let statusRepository: jest.Mocked<Partial<StatusRepository>>;
  let usersRepository: jest.Mocked<Partial<UsersRepository>>;
  let chatService: jest.Mocked<Partial<ChatService>>;
  let chatGateway: { server: any };

  const authorId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();

  const buildStatusDoc = (overrides: Record<string, any> = {}) => ({
    _id: new Types.ObjectId(),
    authorId: { _id: authorId, name: 'Author', avatarUrl: 'author.png' },
    clientStatusId: 'client-1',
    contentType: StatusContentType.TEXT,
    textContent: 'hello',
    privacy: StatusPrivacy.PUBLIC,
    audience: [],
    views: [],
    reactions: [],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    populate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  beforeEach(async () => {
    statusRepository = {
      findByClientStatusId: jest.fn(),
      create: jest.fn(),
      findFeedForUser: jest.fn(),
      findActiveById: jest.fn(),
      findViewersByStatusId: jest.fn(),
      upsertView: jest.fn(),
      upsertReaction: jest.fn(),
      isAudienceSubsetOfMutualContacts: jest.fn(),
    };
    usersRepository = {
      findMutualContactIds: jest.fn().mockResolvedValue([]),
      updateOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };
    chatService = {
      resolvePrivateRoom: jest.fn(),
      saveMessage: jest.fn(),
    };
    chatGateway = {
      server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusService,
        { provide: StatusRepository, useValue: statusRepository },
        { provide: UsersRepository, useValue: usersRepository },
        { provide: ChatService, useValue: chatService },
        { provide: ChatGateway, useValue: chatGateway },
      ],
    }).compile();

    service = module.get<StatusService>(StatusService);
  });

  describe('createStatus', () => {
    it('replays an existing status idempotently when clientStatusId already exists', async () => {
      const existing = buildStatusDoc();
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        existing,
      );

      const result = await service.createStatus(authorId.toString(), {
        clientStatusId: 'client-1',
        contentType: StatusContentType.TEXT,
        textContent: 'hello',
        privacy: StatusPrivacy.PUBLIC,
      } as any);

      expect(result.isNew).toBe(false);
      expect(result.status.id).toBe(existing._id.toString());
      expect(statusRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a text status has no textContent', async () => {
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.createStatus(authorId.toString(), {
          clientStatusId: 'client-2',
          contentType: StatusContentType.TEXT,
          privacy: StatusPrivacy.PUBLIC,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a media status has no file', async () => {
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.createStatus(authorId.toString(), {
          clientStatusId: 'client-3',
          contentType: StatusContentType.IMAGE,
          privacy: StatusPrivacy.PUBLIC,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a private status has no audience', async () => {
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.createStatus(authorId.toString(), {
          clientStatusId: 'client-4',
          contentType: StatusContentType.TEXT,
          textContent: 'hello',
          privacy: StatusPrivacy.PRIVATE,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when audience is not a subset of mutual contacts', async () => {
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        null,
      );
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue([]);
      (
        statusRepository.isAudienceSubsetOfMutualContacts as jest.Mock
      ).mockReturnValue(false);

      await expect(
        service.createStatus(authorId.toString(), {
          clientStatusId: 'client-5',
          contentType: StatusContentType.TEXT,
          textContent: 'hello',
          privacy: StatusPrivacy.PRIVATE,
          audience: [otherUserId.toString()],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a public status and fans out statusReceived to mutual contacts', async () => {
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        null,
      );
      const created = buildStatusDoc({ clientStatusId: 'client-6' });
      (statusRepository.create as jest.Mock).mockResolvedValue(created);
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue([
        otherUserId,
      ]);

      const result = await service.createStatus(authorId.toString(), {
        clientStatusId: 'client-6',
        contentType: StatusContentType.TEXT,
        textContent: 'hello',
        privacy: StatusPrivacy.PUBLIC,
      } as any);

      expect(result.isNew).toBe(true);
      expect(chatGateway.server.to).toHaveBeenCalledWith(
        `user:${otherUserId.toString()}`,
      );
      expect(chatGateway.server.emit).toHaveBeenCalledWith(
        'statusReceived',
        expect.any(Object),
      );
    });

    it('persists defaultStatusAudience and fans out to the audience for private statuses', async () => {
      (statusRepository.findByClientStatusId as jest.Mock).mockResolvedValue(
        null,
      );
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue([
        otherUserId,
      ]);
      (
        statusRepository.isAudienceSubsetOfMutualContacts as jest.Mock
      ).mockReturnValue(true);
      const created = buildStatusDoc({
        clientStatusId: 'client-7',
        privacy: StatusPrivacy.PRIVATE,
        audience: [otherUserId],
      });
      (statusRepository.create as jest.Mock).mockResolvedValue(created);

      const result = await service.createStatus(authorId.toString(), {
        clientStatusId: 'client-7',
        contentType: StatusContentType.TEXT,
        textContent: 'hello',
        privacy: StatusPrivacy.PRIVATE,
        audience: [otherUserId.toString()],
      } as any);

      expect(result.isNew).toBe(true);
      expect(usersRepository.updateOne).toHaveBeenCalledWith(
        { _id: authorId.toString() },
        { $set: { defaultStatusAudience: [otherUserId] } },
      );
      expect(chatGateway.server.to).toHaveBeenCalledWith(
        `user:${otherUserId.toString()}`,
      );
    });
  });

  describe('getFeed', () => {
    it('maps the feed statuses to JSON', async () => {
      const docs = [
        buildStatusDoc(),
        buildStatusDoc({ clientStatusId: 'client-2' }),
      ];
      (statusRepository.findFeedForUser as jest.Mock).mockResolvedValue(docs);

      const result = await service.getFeed(authorId.toString());

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ clientStatusId: 'client-1' });
      expect(result[1]).toMatchObject({ clientStatusId: 'client-2' });
    });
  });

  describe('getViewers', () => {
    it('throws NotFoundException when the status does not exist or has expired', async () => {
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getViewers('status-1', authorId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the requester is not the author', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      await expect(
        service.getViewers('status-1', otherUserId.toString()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the mapped viewers for the author', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);
      const viewedAt = new Date();
      (statusRepository.findViewersByStatusId as jest.Mock).mockResolvedValue({
        views: [
          {
            userId: {
              _id: otherUserId,
              name: 'Viewer',
              avatarUrl: 'viewer.png',
            },
            viewedAt,
          },
        ],
      });

      const result = await service.getViewers('status-1', authorId.toString());

      expect(result).toEqual([
        {
          userId: otherUserId.toString(),
          name: 'Viewer',
          avatarUrl: 'viewer.png',
          viewedAt,
        },
      ]);
    });
  });

  describe('recordView', () => {
    it('does nothing when the status does not exist', async () => {
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(null);

      await service.recordView('status-1', otherUserId.toString());

      expect(statusRepository.upsertView).not.toHaveBeenCalled();
    });

    it('does nothing when the author views their own status', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      await service.recordView('status-1', authorId.toString());

      expect(statusRepository.upsertView).not.toHaveBeenCalled();
    });

    it('emits statusViewerAdded on the first view', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);
      (statusRepository.upsertView as jest.Mock).mockResolvedValue(status);
      (usersRepository.findById as jest.Mock).mockResolvedValue({
        name: 'Viewer',
        avatarUrl: 'viewer.png',
      });

      await service.recordView('status-1', otherUserId.toString());

      expect(chatGateway.server.to).toHaveBeenCalledWith(
        `user:${authorId.toString()}`,
      );
      expect(chatGateway.server.emit).toHaveBeenCalledWith(
        'statusViewerAdded',
        expect.objectContaining({
          statusId: 'status-1',
          viewer: expect.objectContaining({ userId: otherUserId.toString() }),
        }),
      );
    });

    it('does not emit when the user has already viewed (first viewedAt wins)', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);
      (statusRepository.upsertView as jest.Mock).mockResolvedValue(null);

      await service.recordView('status-1', otherUserId.toString());

      expect(chatGateway.server.emit).not.toHaveBeenCalled();
    });
  });

  describe('react', () => {
    it('throws NotFoundException when the status does not exist', async () => {
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.react('status-1', otherUserId.toString(), { reaction: '❤️' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the user is not permitted to view the status', async () => {
      const status = buildStatusDoc({
        authorId,
        privacy: StatusPrivacy.PRIVATE,
        audience: [],
      });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      await expect(
        service.react('status-1', otherUserId.toString(), { reaction: '❤️' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('emits statusReacted to the author when someone else reacts', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue([
        otherUserId,
      ]);
      (usersRepository.findById as jest.Mock).mockResolvedValue({
        name: 'Reactor',
        avatarUrl: 'reactor.png',
      });

      const result = await service.react('status-1', otherUserId.toString(), {
        reaction: '❤️',
      });

      expect(result).toEqual({ statusId: 'status-1', reaction: '❤️' });
      expect(chatGateway.server.to).toHaveBeenCalledWith(
        `user:${authorId.toString()}`,
      );
      expect(chatGateway.server.emit).toHaveBeenCalledWith(
        'statusReacted',
        expect.objectContaining({ statusId: 'status-1', reaction: '❤️' }),
      );
    });

    it('does not emit when the author reacts to their own status', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      await service.react('status-1', authorId.toString(), { reaction: '❤️' });

      expect(chatGateway.server.emit).not.toHaveBeenCalled();
    });
  });

  describe('reply', () => {
    it('saves the message with a statusRef and emits newMessage', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue([
        otherUserId,
      ]);
      (chatService.resolvePrivateRoom as jest.Mock).mockResolvedValue({
        roomId: 'room-1',
      });
      const message = { _id: 'msg-1', content: 'hi' };
      (chatService.saveMessage as jest.Mock).mockResolvedValue({ message });

      const result = await service.reply('status-1', otherUserId.toString(), {
        message: 'hi',
      });

      expect(chatService.resolvePrivateRoom).toHaveBeenCalledWith(
        otherUserId.toString(),
        authorId.toString(),
      );
      expect(chatService.saveMessage).toHaveBeenCalledWith(
        otherUserId.toString(),
        expect.objectContaining({ chatRoomId: 'room-1', content: 'hi' }),
        expect.objectContaining({
          statusRef: expect.objectContaining({ statusId: status._id }),
        }),
      );
      expect(chatGateway.server.to).toHaveBeenCalledWith('room-1');
      expect(chatGateway.server.to).toHaveBeenCalledWith(
        `user:${authorId.toString()}`,
      );
      expect(chatGateway.server.emit).toHaveBeenCalledWith(
        'newMessage',
        message,
      );
      expect(result).toBe(message);
    });

    it('throws ForbiddenException when the user is not permitted to view the status', async () => {
      const status = buildStatusDoc({
        authorId,
        privacy: StatusPrivacy.PRIVATE,
        audience: [],
      });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      await expect(
        service.reply('status-1', otherUserId.toString(), { message: 'hi' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getDefaultAudience', () => {
    it('returns an empty array when the user has no defaultStatusAudience', async () => {
      (usersRepository.findById as jest.Mock).mockResolvedValue({
        defaultStatusAudience: [],
      });

      const result = await service.getDefaultAudience(authorId.toString());

      expect(result).toEqual([]);
    });

    it('returns only mutually-contacted members of defaultStatusAudience', async () => {
      const inMutual = new Types.ObjectId();
      const notInMutual = new Types.ObjectId();
      (usersRepository.findById as jest.Mock).mockResolvedValue({
        defaultStatusAudience: [inMutual, notInMutual],
      });
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue([
        inMutual,
      ]);
      (usersRepository.find as jest.Mock).mockResolvedValue([
        {
          _id: inMutual,
          name: 'Alice',
          phoneNumber: '+1',
          avatarUrl: 'alice.png',
        },
      ]);

      const result = await service.getDefaultAudience(authorId.toString());

      expect(usersRepository.find).toHaveBeenCalledWith({
        _id: { $in: [inMutual.toString()] },
      });
      expect(result).toEqual([
        {
          userId: inMutual.toString(),
          name: 'Alice',
          phoneNumber: '+1',
          avatarUrl: 'alice.png',
        },
      ]);
    });
  });

  describe('getStatusForMediaAccess', () => {
    it('throws NotFoundException when the status does not exist', async () => {
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getStatusForMediaAccess('status-1', otherUserId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException (not Forbidden) when the user is not permitted', async () => {
      const status = buildStatusDoc({
        authorId,
        privacy: StatusPrivacy.PRIVATE,
        audience: [],
      });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      await expect(
        service.getStatusForMediaAccess('status-1', otherUserId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the status when the requester is permitted to view it', async () => {
      const status = buildStatusDoc({ authorId });
      (statusRepository.findActiveById as jest.Mock).mockResolvedValue(status);

      const result = await service.getStatusForMediaAccess(
        'status-1',
        authorId.toString(),
      );

      expect(result).toBe(status);
    });
  });
});
