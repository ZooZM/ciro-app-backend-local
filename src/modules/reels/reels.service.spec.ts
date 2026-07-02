import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReelsService } from './reels.service';
import { ReelsMockStore } from './mock/reels-mock.store';

describe('ReelsService', () => {
  let service: ReelsService;
  const viewerId = 'mock-user-1';

  beforeEach(() => {
    // Fresh store per test — seed data is generated in the constructor.
    service = new ReelsService(new ReelsMockStore());
  });

  describe('getFeed', () => {
    it('returns a page of the requested size', async () => {
      const feed = await service.getFeed(viewerId, { limit: 5 } as any);
      expect(feed.items).toHaveLength(5);
    });

    it('never returns a null nextCursor on the main feed (FR-007 loop)', async () => {
      // Walk past the full 40-video seeded catalog to prove it cycles.
      let cursor: string | undefined;
      for (let i = 0; i < 5; i++) {
        const page = await service.getFeed(viewerId, {
          limit: 10,
          cursor,
        } as any);
        expect(page.nextCursor).not.toBeNull();
        cursor = page.nextCursor as string;
      }
    });

    it('cycles back to the start of the catalog after it is exhausted', async () => {
      const first = await service.getFeed(viewerId, { limit: 10 } as any);
      // 4 pages of 10 = 40 = exactly the catalog size; the 5th page must
      // repeat the first page's items (proves looping, not just non-null cursor).
      let cursor = first.nextCursor as string;
      let page;
      for (let i = 0; i < 3; i++) {
        page = await service.getFeed(viewerId, { limit: 10, cursor } as any);
        cursor = page.nextCursor as string;
      }
      const fifthPage = await service.getFeed(viewerId, {
        limit: 10,
        cursor,
      } as any);
      expect(fifthPage.items.map((i) => i.id)).toEqual(
        first.items.map((i) => i.id),
      );
    });

    it('creator-scoped feed is finite (nextCursor eventually null)', async () => {
      const page = await service.getFeed(viewerId, {
        limit: 100,
        creatorId: 'mock-user-1',
      } as any);
      expect(page.nextCursor).toBeNull();
      expect(page.items.every((i) => i.creator.id === 'mock-user-1')).toBe(
        true,
      );
    });

    it('rejects a malformed cursor', async () => {
      await expect(
        service.getFeed(viewerId, { limit: 10, cursor: 'not-a-number' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getReel', () => {
    it('returns the reel for a known id', async () => {
      const reel = await service.getReel('reel-1', viewerId);
      expect(reel.id).toBe('reel-1');
    });

    it('throws NotFoundException for an unknown id', async () => {
      await expect(service.getReel('nope', viewerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('toggleLike', () => {
    it('toggles a like on then off, adjusting likesCount both times', async () => {
      const before = await service.getReel('reel-1', viewerId);
      const liked = await service.toggleLike('reel-1', viewerId);
      expect(liked.liked).toBe(true);
      expect(liked.likesCount).toBe(before.likesCount + 1);

      const unliked = await service.toggleLike('reel-1', viewerId);
      expect(unliked.liked).toBe(false);
      expect(unliked.likesCount).toBe(before.likesCount);
    });

    it('throws NotFoundException for an unknown reel', async () => {
      await expect(service.toggleLike('nope', viewerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('comments', () => {
    it('adding a comment increments commentsCount and appears newest-first', async () => {
      const before = await service.getComments('reel-1', {} as any);
      const added = await service.addComment('reel-1', viewerId, 'Nice edit!');
      expect(added.commentsCount).toBe(before.commentsCount + 1);

      const after = await service.getComments('reel-1', {} as any);
      expect(after.items[0].text).toBe('Nice edit!');
      expect(after.items[0].authorId).toBe(viewerId);
    });

    it('throws NotFoundException posting to an unknown reel', async () => {
      await expect(
        service.addComment('nope', viewerId, 'hi'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getProfile (US4)', () => {
    it("returns stats and the videos grid ordered newest-first, matching totalLikes to the sum of that creator's likes", async () => {
      const profile = await service.getProfile('mock-user-1', viewerId);
      expect(profile.user.id).toBe('mock-user-1');
      expect(profile.videos.length).toBeGreaterThan(0);
      expect(
        profile.videos.every((v) => typeof v.thumbnailUrl === 'string'),
      ).toBe(true);

      // Video order must be newest-first (matches the main feed's ordering).
      const creatorReels = await Promise.all(
        profile.videos.map((v) => service.getReel(v.id, viewerId)),
      );
      const timestamps = creatorReels.map((r) =>
        new Date(r.createdAt).getTime(),
      );
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));

      const summedLikes = creatorReels.reduce(
        (sum, r) => sum + r.likesCount,
        0,
      );
      expect(profile.stats.totalLikes).toBe(summedLikes);
    });

    it('throws NotFoundException for an unknown user', async () => {
      await expect(service.getProfile('nope', viewerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('viewer.isSelf is true only when viewing your own profile', async () => {
      const own = await service.getProfile(viewerId, viewerId);
      const other = await service.getProfile('mock-user-2', viewerId);
      expect(own.viewer.isSelf).toBe(true);
      expect(other.viewer.isSelf).toBe(false);
    });
  });

  describe('toggleFollow (US5)', () => {
    it('toggles follow on then off, adjusting followersCount both times (uniqueness — no duplicate follow rows)', async () => {
      // mock-user-3 is not among the seed's cyclic follow relationships for
      // mock-user-1 (viewerId), so this starts from a genuine not-following state.
      const before = await service.getProfile('mock-user-3', viewerId);
      expect(before.viewer.following).toBe(false);

      const followed = await service.toggleFollow('mock-user-3', viewerId);
      expect(followed.following).toBe(true);
      expect(followed.followersCount).toBe(before.stats.followers + 1);

      const unfollowed = await service.toggleFollow('mock-user-3', viewerId);
      expect(unfollowed.following).toBe(false);
      expect(unfollowed.followersCount).toBe(before.stats.followers);
    });

    it('rejects following yourself with BadRequestException', async () => {
      await expect(
        service.toggleFollow(viewerId, viewerId),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for an unknown user', async () => {
      await expect(
        service.toggleFollow('nope', viewerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recordShare', () => {
    it('appends a share event and increments sharesCount each call (no toggle)', async () => {
      const before = await service.getReel('reel-1', viewerId);
      const first = await service.recordShare('reel-1', viewerId);
      const second = await service.recordShare('reel-1', viewerId);
      expect(first.sharesCount).toBe(before.sharesCount + 1);
      expect(second.sharesCount).toBe(before.sharesCount + 2);
    });
  });
});
