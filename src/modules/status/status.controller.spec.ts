import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusContentType, StatusPrivacy } from './schemas/status.schema';

describe('StatusController', () => {
  let controller: StatusController;
  let statusService: jest.Mocked<Partial<StatusService>>;

  const req = { user: { userId: 'user-1', phoneNumber: '+1' } } as any;

  beforeEach(async () => {
    statusService = {
      getFeed: jest.fn(),
      getDefaultAudience: jest.fn(),
      createStatus: jest.fn(),
      getViewers: jest.fn(),
      react: jest.fn(),
      reply: jest.fn(),
      getStatusForMediaAccess: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusController],
      providers: [{ provide: StatusService, useValue: statusService }],
    }).compile();

    controller = module.get<StatusController>(StatusController);
  });

  describe('getFeed', () => {
    it('returns the feed for the authenticated user', async () => {
      const feed = [{ id: 'status-1' }];
      (statusService.getFeed as jest.Mock).mockResolvedValue(feed);

      const result = await controller.getFeed(req);

      expect(statusService.getFeed).toHaveBeenCalledWith('user-1');
      expect(result).toBe(feed);
    });
  });

  describe('getDefaultAudience', () => {
    it('returns the default audience for the authenticated user', async () => {
      const audience = [{ userId: 'user-2', name: 'Bob' }];
      (statusService.getDefaultAudience as jest.Mock).mockResolvedValue(
        audience,
      );

      const result = await controller.getDefaultAudience(req);

      expect(statusService.getDefaultAudience).toHaveBeenCalledWith('user-1');
      expect(result).toBe(audience);
    });
  });

  describe('uploadStatus', () => {
    const mockResponse = () => ({ status: jest.fn() }) as any;

    it('returns 201 CREATED for a newly-created status', async () => {
      const status = { id: 'status-1' };
      (statusService.createStatus as jest.Mock).mockResolvedValue({
        status,
        isNew: true,
      });
      const res = mockResponse();
      const dto = {
        clientStatusId: 'client-1',
        contentType: StatusContentType.TEXT,
        textContent: 'hi',
        privacy: StatusPrivacy.PUBLIC,
      } as any;

      const result = await controller.uploadStatus(req, dto, res);

      expect(statusService.createStatus).toHaveBeenCalledWith(
        'user-1',
        dto,
        undefined,
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toBe(status);
    });

    it('returns 200 OK when replaying an existing status (idempotent)', async () => {
      const status = { id: 'status-1' };
      (statusService.createStatus as jest.Mock).mockResolvedValue({
        status,
        isNew: false,
      });
      const res = mockResponse();
      const dto = {
        clientStatusId: 'client-1',
        contentType: StatusContentType.TEXT,
        textContent: 'hi',
        privacy: StatusPrivacy.PUBLIC,
      } as any;

      const result = await controller.uploadStatus(req, dto, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toBe(status);
    });

    it('forwards the uploaded file to the service', async () => {
      (statusService.createStatus as jest.Mock).mockResolvedValue({
        status: { id: 'status-2' },
        isNew: true,
      });
      const res = mockResponse();
      const dto = {
        clientStatusId: 'client-2',
        contentType: StatusContentType.IMAGE,
        privacy: StatusPrivacy.PUBLIC,
      } as any;
      const file = { filename: 'a.jpg' } as any;

      await controller.uploadStatus(req, dto, res, file);

      expect(statusService.createStatus).toHaveBeenCalledWith(
        'user-1',
        dto,
        file,
      );
    });
  });

  describe('getViewers', () => {
    it('returns the viewers for a status', async () => {
      const viewers = [
        { userId: 'user-2', name: 'Bob', avatarUrl: '', viewedAt: new Date() },
      ];
      (statusService.getViewers as jest.Mock).mockResolvedValue(viewers);

      const result = await controller.getViewers(req, 'status-1');

      expect(statusService.getViewers).toHaveBeenCalledWith(
        'status-1',
        'user-1',
      );
      expect(result).toBe(viewers);
    });
  });

  describe('react', () => {
    it('forwards the reaction to the service', async () => {
      const response = { statusId: 'status-1', reaction: '❤️' };
      (statusService.react as jest.Mock).mockResolvedValue(response);
      const dto = { reaction: '❤️' };

      const result = await controller.react(req, 'status-1', dto);

      expect(statusService.react).toHaveBeenCalledWith(
        'status-1',
        'user-1',
        dto,
      );
      expect(result).toBe(response);
    });
  });

  describe('reply', () => {
    it('forwards the reply to the service', async () => {
      const message = { _id: 'msg-1', content: 'hi' };
      (statusService.reply as jest.Mock).mockResolvedValue(message);
      const dto = { message: 'hi' };

      const result = await controller.reply(req, 'status-1', dto);

      expect(statusService.reply).toHaveBeenCalledWith(
        'status-1',
        'user-1',
        dto,
      );
      expect(result).toBe(message);
    });
  });

  describe('getMedia', () => {
    it('throws NotFoundException when access is denied or the status does not exist', async () => {
      (statusService.getStatusForMediaAccess as jest.Mock).mockRejectedValue(
        new NotFoundException(),
      );
      const res = { set: jest.fn(), sendFile: jest.fn() } as any;

      await expect(
        controller.getMedia(req, 'status-1', 'missing.jpg', res),
      ).rejects.toThrow(NotFoundException);
      expect(statusService.getStatusForMediaAccess).toHaveBeenCalledWith(
        'status-1',
        'user-1',
      );
    });
  });
});
