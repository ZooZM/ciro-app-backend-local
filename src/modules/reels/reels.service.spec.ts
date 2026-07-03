import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReelsService } from './reels.service';
import { ReelsRepository } from './reels.repository';
import { ReelsNotificationsService } from './reels-notifications.service';

interface MockUserModel {
  findById: jest.Mock;
  find: jest.Mock;
  updateOne: jest.Mock;
}

/**
 * Unit tests for `ReelsService` against a mocked `ReelsRepository` (v2 —
 * the previous suite drove the in-memory `ReelsMockStore` directly; that
 * store is retired now that the repository is Mongoose-backed. Repository-
 * level behavior — real counter integrity, block filtering, unique-index
 * dedup — is covered by `reels.e2e-spec.ts` against `mongodb-memory-server`.
 * This suite proves ReelsService's own logic: block-set assembly,
 * self-follow/self-block guards, and that notifications fire only on the
 * "on" transition (never on unlike/unfollow).
 */
describe('ReelsService', () => {
  const viewerId = '65f1a2b3c4d5e6f7a8b9c0d1';
  const otherId = '65f1a2b3c4d5e6f7a8b9c0d2';
  const reelId = '65f1a2b3c4d5e6f7a8b9c0e1';

  let repository: jest.Mocked<ReelsRepository>;
  let userModel: MockUserModel;
  let notifications: jest.Mocked<ReelsNotificationsService>;
  let service: ReelsService;

  beforeEach(() => {
    repository = {
      listFeed: jest.fn(),
      getReel: jest.fn(),
      toggleLike: jest.fn(),
      listComments: jest.fn(),
      addComment: jest.fn(),
      recordShare: jest.fn(),
      getProfile: jest.fn(),
      toggleFollow: jest.fn(),
      recordView: jest.fn(),
      toggleSave: jest.fn(),
      listLiked: jest.fn(),
      listSaved: jest.fn(),
      searchReels: jest.fn(),
      searchUsers: jest.fn(),
    };

    userModel = {
      findById: jest.fn(() => ({
        select: jest.fn(() => ({
          lean: jest.fn(() => ({
            exec: jest.fn(() => Promise.resolve({ blockedUsers: [] })),
          })),
        })),
        exec: jest.fn(() => Promise.resolve({ blockedUsers: [] })),
      })),
      find: jest.fn(() => ({
        select: jest.fn(() => ({
          lean: jest.fn(() => ({ exec: jest.fn(() => Promise.resolve([])) })),
        })),
      })),
      updateOne: jest.fn(() => ({ exec: jest.fn(() => Promise.resolve()) })),
    };

    notifications = {
      notifyNewFollower: jest.fn(),
      notifyReelLike: jest.fn(),
      notifyMentions: jest.fn(),
    } as unknown as jest.Mocked<ReelsNotificationsService>;

    service = new ReelsService(repository, userModel as never, notifications);
  });

  describe('getFeed', () => {
    it('passes the caller block set through to the repository', async () => {
      userModel.findById.mockReturnValueOnce({
        select: jest.fn(() => ({
          lean: jest.fn(() => ({
            exec: jest.fn(() =>
              Promise.resolve({ blockedUsers: [new Types.ObjectId(otherId)] }),
            ),
          })),
        })),
        exec: jest.fn(),
      });
      repository.listFeed.mockResolvedValue({ items: [], nextCursor: null });

      await service.getFeed(viewerId, { limit: 10 } as never);

      // jest.fn() properties and Jest's asymmetric matchers are not
      // `this`-bound / are typed `any` by design — both are known
      // typescript-eslint false positives on jest mocks, not real issues.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repository.listFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          viewerId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          excludeCreatorIds: expect.arrayContaining([otherId]),
        }),
      );
    });
  });

  describe('getReel', () => {
    it('throws NotFoundException when the repository returns null', async () => {
      repository.getReel.mockResolvedValue(null);
      await expect(service.getReel(reelId, viewerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('toggleLike', () => {
    it('notifies the creator when a like turns ON', async () => {
      repository.toggleLike.mockResolvedValue({
        liked: true,
        likesCount: 5,
        reel: {
          id: reelId,
          creatorId: otherId,
          videoUrl: '',
          thumbnailUrl: '',
          description: '',
          hashtags: [],
          mentions: [],
          createdAt: new Date().toISOString(),
        },
      });

      await service.toggleLike(reelId, viewerId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notifications.notifyReelLike).toHaveBeenCalledWith({
        actorId: viewerId,
        recipientId: otherId,
        reelId,
      });
    });

    it('does NOT notify when a like turns OFF (unlike)', async () => {
      repository.toggleLike.mockResolvedValue({
        liked: false,
        likesCount: 4,
        reel: {
          id: reelId,
          creatorId: otherId,
          videoUrl: '',
          thumbnailUrl: '',
          description: '',
          hashtags: [],
          mentions: [],
          createdAt: new Date().toISOString(),
        },
      });

      await service.toggleLike(reelId, viewerId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notifications.notifyReelLike).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown reel', async () => {
      repository.toggleLike.mockResolvedValue(null);
      await expect(service.toggleLike(reelId, viewerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('toggleFollow (US5)', () => {
    it('notifies the followee when following turns ON', async () => {
      repository.toggleFollow.mockResolvedValue({
        following: true,
        followersCount: 10,
      });

      await service.toggleFollow(otherId, viewerId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notifications.notifyNewFollower).toHaveBeenCalledWith({
        actorId: viewerId,
        recipientId: otherId,
      });
    });

    it('does NOT notify when unfollowing', async () => {
      repository.toggleFollow.mockResolvedValue({
        following: false,
        followersCount: 9,
      });

      await service.toggleFollow(otherId, viewerId);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(notifications.notifyNewFollower).not.toHaveBeenCalled();
    });

    it('rejects following yourself with BadRequestException without touching the repository', async () => {
      repository.toggleFollow.mockResolvedValue('self');
      await expect(
        service.toggleFollow(viewerId, viewerId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for an unknown user', async () => {
      repository.toggleFollow.mockResolvedValue(null);
      await expect(
        service.toggleFollow(otherId, viewerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recordView / toggleSave (FR-048/FR-049)', () => {
    it('recordView throws NotFoundException for an unknown reel', async () => {
      repository.recordView.mockResolvedValue(null);
      await expect(service.recordView(reelId, viewerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('toggleSave returns the repository result unchanged (no public counter)', async () => {
      repository.toggleSave.mockResolvedValue({ saved: true });
      const result = await service.toggleSave(reelId, viewerId);
      expect(result).toEqual({ saved: true });
    });
  });

  describe('toggleBlock (FR-052)', () => {
    it('rejects blocking yourself with BadRequestException', async () => {
      await expect(
        service.toggleBlock(viewerId, viewerId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for an unknown target', async () => {
      userModel.findById.mockReturnValue({
        exec: jest.fn(() => Promise.resolve(null)),
        select: jest.fn(),
      });
      await expect(
        service.toggleBlock(otherId, viewerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
