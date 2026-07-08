import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { ReelsModule } from '../src/modules/reels/reels.module';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';
import {
  Reel,
  ReelDocument,
  ReelStatus,
} from '../src/modules/reels/schemas/reel.schema';
import { ReelsModerationService } from '../src/modules/reels/reels-moderation.service';
import { REELS_MODERATION_QUEUE } from '../src/modules/reels/reels-moderation.processor';
import {
  NotificationEvent,
  NotificationEventDocument,
} from '../src/modules/reels/schemas/notification-event.schema';
import { Follow, FollowDocument } from '../src/modules/reels/schemas/follow.schema';

/** A minimal, real, parseable WAV buffer — lets FR-060a's server-side
 * duration check run against a genuine container without needing ffmpeg in
 * the test environment. Attached with a `.wav` filename (`music-metadata`
 * dispatches by extension) but `contentType: 'video/mp4'` so Multer's
 * declared-mimetype `fileFilter` accepts it as a video upload. */
function makeTestVideoBuffer(durationSeconds: number): Buffer {
  const sampleRate = 8000;
  const blockAlign = 2; // mono, 16-bit
  const dataSize = Math.round(durationSeconds * sampleRate) * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

interface FeedBody {
  items: {
    id: string;
    creator: { id: string; username: string };
    hashtags: string[];
    viewerSaved: boolean;
  }[];
  nextCursor: string | null;
}
interface ReelBody {
  id: string;
  viewerLiked: boolean;
  viewerSaved: boolean;
}
interface LikeBody {
  liked: boolean;
  likesCount: number;
}
interface SaveBody {
  saved: boolean;
}
interface ViewBody {
  viewsCount: number;
}
interface ProfileBody {
  user: { id: string; username: string };
  stats: { followers: number };
}
interface FollowBody {
  following: boolean;
  followersCount: number;
}
interface BlockBody {
  blocked: boolean;
}
interface UserSearchBody {
  items: { id: string; username: string; name: string }[];
}
interface CommentPostBody {
  comment: { text: string };
  commentsCount: number;
}
interface ShareBody {
  sharesCount: number;
}

/**
 * e2e coverage for the Reels module (021-reels-video-feed, v2 — real
 * MongoDB via `mongodb-memory-server`; the mock store this test used to
 * exercise directly has been retired). Deliberately does NOT import
 * AppModule (which requires Redis + other live infra) — spins up just the
 * real auth stack (PassportModule + JwtModule + real JwtStrategy) alongside
 * ReelsModule (which self-registers its own Mongoose schemas) against an
 * in-memory Mongo instance, so requests exercise the real JwtAuthGuard,
 * real schemas, and real seeded data.
 */
describe('Reels module (e2e)', () => {
  let mongod: MongoMemoryServer;
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let userModel: Model<UserDocument>;
  let reelModel: Model<ReelDocument>;
  let notificationEventModel: Model<NotificationEventDocument>;
  let followModel: Model<FollowDocument>;
  let moderationService: ReelsModerationService;
  let phoneCounter = 0;

  /**
   * Signs a token for a genuine `User` document (upserted with the given
   * id) — a real authenticated caller always has a backing document (e.g.
   * `toggleBlock` looks the viewer up), unlike the retired mock store where
   * arbitrary string ids like 'mock-user-1' needed no backing record.
   */
  async function tokenFor(userId: string): Promise<string> {
    await userModel.findByIdAndUpdate(
      userId,
      {
        $setOnInsert: {
          name: 'Test Viewer',
          phoneNumber: `+1999${phoneCounter++}`,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return jwtService.sign({ sub: userId, phoneNumber: '+10000000000' });
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(uri),
        // v3: ReelsModule registers a BullMQ queue (reels-moderation) — a
        // root connection registration is required somewhere in the module
        // tree for `@nestjs/bullmq`'s BullExplorer to construct its Worker,
        // mirroring app.module.ts's real registration.
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            connection: {
              url:
                configService.get<string>('REDIS_URL') ||
                'redis://localhost:6379',
              maxRetriesPerRequest: null,
            },
          }),
        }),
        PassportModule,
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>('JWT_SECRET') || 'default-secret',
            signOptions: { expiresIn: '15m' },
          }),
          inject: [ConfigService],
        }),
        ReelsModule,
      ],
      providers: [JwtStrategy],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    // ReelsSeedService.onModuleInit() has now run — the demo catalog exists.

    jwtService = moduleFixture.get(JwtService);
    userModel = moduleFixture.get(getModelToken(User.name));
    reelModel = moduleFixture.get(getModelToken(Reel.name));
    notificationEventModel = moduleFixture.get(
      getModelToken(NotificationEvent.name),
    );
    followModel = moduleFixture.get(getModelToken(Follow.name));
    moderationService = moduleFixture.get(ReelsModerationService);

    // Every moderation assertion in this file drives the pipeline via
    // direct `moderationService.moderateReel()` invocation for determinism
    // (plan.md T125 — "direct processor invocation"). The real BullMQ
    // Worker is still correctly wired (proving the production DI graph),
    // but left running it would race those direct calls unpredictably
    // against local Mongo/Redis (jobs can complete in single-digit ms) —
    // so it's paused for the whole suite.
    const moderationQueue = moduleFixture.get<Queue>(
      getQueueToken(REELS_MODERATION_QUEUE),
    );
    await moderationQueue.pause();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await mongoose.disconnect();
    await mongod.stop();
  });

  async function firstCreatorId(): Promise<string> {
    const token = await tokenFor('000000000000000000000001');
    const feed = await request(app.getHttpServer())
      .get('/api/reels?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (feed.body as FeedBody).items[0].creator.id;
  }

  describe('auth guard', () => {
    it('rejects GET /api/reels with no token', () => {
      return request(app.getHttpServer()).get('/api/reels').expect(401);
    });

    it('rejects POST /api/reels/:id/like with no token', () => {
      return request(app.getHttpServer())
        .post('/api/reels/000000000000000000000000/like')
        .expect(401);
    });
  });

  describe('happy path: feed → like → view → save → comment → share → profile → follow', () => {
    it('walks the full flow end-to-end with a real signed token', async () => {
      const viewerId = '000000000000000000000002';
      const token = await tokenFor(viewerId);

      const feed = await request(app.getHttpServer())
        .get('/api/reels?limit=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const feedBody = feed.body as FeedBody;
      expect(feedBody.items).toHaveLength(5);
      expect(feedBody.nextCursor).not.toBeNull();
      // v2 fields present on the feed DTO:
      expect(feedBody.items[0].creator.username).toEqual(expect.any(String));
      expect(Array.isArray(feedBody.items[0].hashtags)).toBe(true);
      const reelId = feedBody.items[0].id;
      const creatorId = feedBody.items[0].creator.id;

      const single = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const singleBody = single.body as ReelBody;
      expect(singleBody.id).toBe(reelId);
      expect(singleBody.viewerSaved).toBe(false);

      const like = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((like.body as LikeBody).liked).toBe(true);

      const view = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/view`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const viewsAfterFirst = (view.body as ViewBody).viewsCount;
      const viewAgain = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/view`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      // FR-048: dedup — a second view from the same user does not increment.
      expect((viewAgain.body as ViewBody).viewsCount).toBe(viewsAfterFirst);

      const save = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/save`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((save.body as SaveBody).saved).toBe(true);

      const savedList = await request(app.getHttpServer())
        .get('/api/reels/saved')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((savedList.body as FeedBody).items.map((i) => i.id)).toContain(
        reelId,
      );

      const likedList = await request(app.getHttpServer())
        .get('/api/reels/liked')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((likedList.body as FeedBody).items.map((i) => i.id)).toContain(
        reelId,
      );

      const comment = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Great reel!' })
        .expect(201);
      expect((comment.body as CommentPostBody).comment.text).toBe(
        'Great reel!',
      );

      const share = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/share`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((share.body as ShareBody).sharesCount).toBeGreaterThan(0);

      const profile = await request(app.getHttpServer())
        .get(`/api/users/${creatorId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((profile.body as ProfileBody).user.id).toBe(creatorId);

      const followersBefore = (profile.body as ProfileBody).stats.followers;
      const follow = await request(app.getHttpServer())
        .post(`/api/users/${creatorId}/follow`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((follow.body as FollowBody).following).toBe(true);
      expect((follow.body as FollowBody).followersCount).toBe(
        followersBefore + 1,
      );
    });

    it('rejects an empty comment with 400', async () => {
      const token = await tokenFor('000000000000000000000003');
      const feed = await request(app.getHttpServer())
        .get('/api/reels?limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const reelId = (feed.body as FeedBody).items[0].id;

      return request(app.getHttpServer())
        .post(`/api/reels/${reelId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '   ' })
        .expect(400);
    });
  });

  describe('counter integrity (FR-055)', () => {
    it('double-toggling like/save/follow returns all counters to their baseline', async () => {
      const viewerId = '000000000000000000000009';
      const token = await tokenFor(viewerId);
      const creatorId = await firstCreatorId();

      const before = await request(app.getHttpServer())
        .get(`/api/reels?creatorId=${creatorId}&limit=1`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const reelId = (before.body as FeedBody).items[0].id;

      const singleBefore = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const likesBefore = (singleBefore.body as LikeBody).likesCount;

      const profileBefore = await request(app.getHttpServer())
        .get(`/api/users/${creatorId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const totalLikesBefore = (
        profileBefore.body as ProfileBody & {
          stats: { totalLikes: number };
        }
      ).stats.totalLikes;
      const followersBefore = (profileBefore.body as ProfileBody).stats
        .followers;

      // Like -> unlike.
      const like1 = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((like1.body as LikeBody).liked).toBe(true);
      const like2 = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((like2.body as LikeBody).liked).toBe(false);
      expect((like2.body as LikeBody).likesCount).toBe(likesBefore);

      // Save -> unsave.
      const save1 = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/save`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((save1.body as SaveBody).saved).toBe(true);
      const save2 = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/save`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((save2.body as SaveBody).saved).toBe(false);

      // Follow -> unfollow.
      const follow1 = await request(app.getHttpServer())
        .post(`/api/users/${creatorId}/follow`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((follow1.body as FollowBody).following).toBe(true);
      const follow2 = await request(app.getHttpServer())
        .post(`/api/users/${creatorId}/follow`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((follow2.body as FollowBody).following).toBe(false);
      expect((follow2.body as FollowBody).followersCount).toBe(followersBefore);

      const profileAfter = await request(app.getHttpServer())
        .get(`/api/users/${creatorId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (profileAfter.body as ProfileBody & { stats: { totalLikes: number } })
          .stats.totalLikes,
      ).toBe(totalLikesBefore);
    });
  });

  describe('search (FR-057)', () => {
    it('finds reels by hashtag substring and users by name substring', async () => {
      const token = await tokenFor('000000000000000000000004');

      const videoSearch = await request(app.getHttpServer())
        .get('/api/reels/search?q=trav')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (videoSearch.body as FeedBody).items.every((i) =>
          i.hashtags.some((h) => h.includes('trav')),
        ),
      ).toBe(true);

      const userSearch = await request(app.getHttpServer())
        .get('/api/users/search?q=lina')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (userSearch.body as UserSearchBody).items.some((u) =>
          u.username.includes('lina'),
        ),
      ).toBe(true);
    });

    it('rejects a whitespace-only query with 400', async () => {
      const token = await tokenFor('000000000000000000000004');
      return request(app.getHttpServer())
        .get('/api/reels/search?q=%20%20')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('hashtag feed (FR-047a)', () => {
    it('is finite and scoped to the exact tag', async () => {
      const token = await tokenFor('000000000000000000000005');
      const page = await request(app.getHttpServer())
        .get('/api/reels?hashtag=travel&limit=25')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const body = page.body as FeedBody;
      expect(body.nextCursor).toBeNull();
      expect(body.items.every((i) => i.hashtags.includes('travel'))).toBe(true);
    });
  });

  describe('blocking (FR-052/053)', () => {
    it('mutually excludes reels/profile once one user blocks another', async () => {
      const viewerId = '000000000000000000000006';
      const token = await tokenFor(viewerId);
      const creatorId = await firstCreatorId();

      const before = await request(app.getHttpServer())
        .get(`/api/reels?creatorId=${creatorId}&limit=1`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((before.body as FeedBody).items.length).toBeGreaterThan(0);

      const block = await request(app.getHttpServer())
        .post(`/api/users/${creatorId}/block`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((block.body as BlockBody).blocked).toBe(true);

      // Creator's reels vanish from the viewer's creator-scoped feed.
      const after = await request(app.getHttpServer())
        .get(`/api/reels?creatorId=${creatorId}&limit=1`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((after.body as FeedBody).items.length).toBe(0);

      // Profile lookup 404s too (indistinguishable from unknown — FR-053).
      await request(app.getHttpServer())
        .get(`/api/users/${creatorId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      // Unblock restores visibility.
      const unblock = await request(app.getHttpServer())
        .post(`/api/users/${creatorId}/block`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((unblock.body as BlockBody).blocked).toBe(false);
    });

    it('rejects blocking yourself with 400', async () => {
      const viewerId = '000000000000000000000007';
      const token = await tokenFor(viewerId);
      return request(app.getHttpServer())
        .post(`/api/users/${viewerId}/block`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('follow guard', () => {
    it('rejects following yourself with 400', async () => {
      const viewerId = '000000000000000000000008';
      const token = await tokenFor(viewerId);
      return request(app.getHttpServer())
        .post(`/api/users/${viewerId}/follow`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('moderation visibility (FR-061/FR-064, v3)', () => {
    async function createRawReel(params: {
      creatorId: string;
      status: ReelStatus;
      hashtags?: string[];
    }): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(params.creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v3 test reel',
        hashtags: params.hashtags ?? [],
        mentions: [],
        status: params.status,
      });
      return doc._id.toString();
    }

    it('hides a pending reel from non-owners everywhere and 404s all engagement, but the owner sees it with its status', async () => {
      const ownerId = '00000000000000000000000a';
      const ownerToken = await tokenFor(ownerId);
      const otherToken = await tokenFor('00000000000000000000000b');
      const pendingId = await createRawReel({
        creatorId: ownerId,
        status: ReelStatus.PENDING_MODERATION,
      });

      // Non-owner: single fetch 404s — the deep-link unknown-reel path.
      await request(app.getHttpServer())
        .get(`/api/reels/${pendingId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      // Non-owner: absent from the creator-scoped feed.
      const creatorFeed = await request(app.getHttpServer())
        .get(`/api/reels?creatorId=${ownerId}&limit=25`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(
        (creatorFeed.body as FeedBody).items.map((i) => i.id),
      ).not.toContain(pendingId);

      // Non-owner: absent from the profile grid.
      const profile = await request(app.getHttpServer())
        .get(`/api/users/${ownerId}/profile`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(
        (
          profile.body as ProfileBody & {
            videos: { id: string }[];
          }
        ).videos.map((v) => v.id),
      ).not.toContain(pendingId);

      // Non-owner: every engagement action 404s (FR-064).
      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/like`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/view`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/save`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/share`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/comments`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ text: 'hello' })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/reels/${pendingId}/comments`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      // Owner: single fetch succeeds and carries the correct status.
      const ownerFetch = await request(app.getHttpServer())
        .get(`/api/reels/${pendingId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((ownerFetch.body as ReelBody & { status: string }).status).toBe(
        'pending_moderation',
      );

      // Owner: own profile grid includes it, badge-ready via `status`.
      const ownProfile = await request(app.getHttpServer())
        .get(`/api/users/${ownerId}/profile`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const mine = (
        ownProfile.body as ProfileBody & {
          videos: { id: string; status: string }[];
        }
      ).videos.find((v) => v.id === pendingId);
      expect(mine?.status).toBe('pending_moderation');
    });

    it('hides a rejected reel the same way, including from search and its hashtag feed', async () => {
      const ownerId = '00000000000000000000000c';
      const otherToken = await tokenFor('00000000000000000000000d');
      const rejectedId = await createRawReel({
        creatorId: ownerId,
        status: ReelStatus.REJECTED,
        hashtags: ['v3rejectedtag'],
      });

      await request(app.getHttpServer())
        .get(`/api/reels/${rejectedId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      const search = await request(app.getHttpServer())
        .get('/api/reels/search?q=v3rejectedtag')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect((search.body as FeedBody).items.map((i) => i.id)).not.toContain(
        rejectedId,
      );

      const hashtagFeed = await request(app.getHttpServer())
        .get('/api/reels?hashtag=v3rejectedtag')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(
        (hashtagFeed.body as FeedBody).items.map((i) => i.id),
      ).not.toContain(rejectedId);
    });

    it('leaves seeded (pre-v3) reels published and unaffected', async () => {
      const token = await tokenFor('00000000000000000000000f');
      const feed = await request(app.getHttpServer())
        .get('/api/reels?limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (feed.body as FeedBody & { items: { status: string }[] }).items[0]
          .status,
      ).toBe('published');
    });
  });

  describe('hidden visibility (FR-070, v4)', () => {
    async function createRawReel(params: {
      creatorId: string;
      status: ReelStatus;
      hashtags?: string[];
    }): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(params.creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v4 test reel',
        hashtags: params.hashtags ?? [],
        mentions: [],
        status: params.status,
      });
      return doc._id.toString();
    }

    // FR-070: `hidden` is a fourth non-published status. Before T143/T144
    // implement the report/admin endpoints that actually *write* this
    // status, this block proves the schema-level regression: a `hidden`
    // reel is excluded by the same `visibilityFilter` composition that
    // already excludes pending/rejected reels — zero query changes needed.
    it('hides a reel from non-owners everywhere and 404s all engagement, but the owner sees it with its status', async () => {
      const ownerId = '000000000000000000000010';
      const ownerToken = await tokenFor(ownerId);
      const otherToken = await tokenFor('000000000000000000000011');
      const hiddenId = await createRawReel({
        creatorId: ownerId,
        status: ReelStatus.HIDDEN,
        hashtags: ['v4hiddentag'],
      });

      // Non-owner: single fetch 404s — the deep-link unknown-reel path.
      await request(app.getHttpServer())
        .get(`/api/reels/${hiddenId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      // Non-owner: absent from the creator-scoped feed.
      const creatorFeed = await request(app.getHttpServer())
        .get(`/api/reels?creatorId=${ownerId}&limit=25`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(
        (creatorFeed.body as FeedBody).items.map((i) => i.id),
      ).not.toContain(hiddenId);

      // Non-owner: absent from the profile grid.
      const profile = await request(app.getHttpServer())
        .get(`/api/users/${ownerId}/profile`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(
        (
          profile.body as ProfileBody & {
            videos: { id: string }[];
          }
        ).videos.map((v) => v.id),
      ).not.toContain(hiddenId);

      // Non-owner: absent from search and its hashtag feed.
      const search = await request(app.getHttpServer())
        .get('/api/reels/search?q=v4hiddentag')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect((search.body as FeedBody).items.map((i) => i.id)).not.toContain(
        hiddenId,
      );
      const hashtagFeed = await request(app.getHttpServer())
        .get('/api/reels?hashtag=v4hiddentag')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect(
        (hashtagFeed.body as FeedBody).items.map((i) => i.id),
      ).not.toContain(hiddenId);

      // Non-owner: every engagement action 404s (FR-064 rule extended to `hidden`).
      await request(app.getHttpServer())
        .post(`/api/reels/${hiddenId}/like`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${hiddenId}/view`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${hiddenId}/save`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${hiddenId}/share`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${hiddenId}/comments`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ text: 'hello' })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/reels/${hiddenId}/comments`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      // Owner: single fetch succeeds and carries the "hidden" status
      // (client renders this as "Under review" — FR-072).
      const ownerFetch = await request(app.getHttpServer())
        .get(`/api/reels/${hiddenId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((ownerFetch.body as ReelBody & { status: string }).status).toBe(
        'hidden',
      );

      // Owner: own profile grid includes it, badge-ready via `status`.
      const ownProfile = await request(app.getHttpServer())
        .get(`/api/users/${ownerId}/profile`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const mine = (
        ownProfile.body as ProfileBody & {
          videos: { id: string; status: string }[];
        }
      ).videos.find((v) => v.id === hiddenId);
      expect(mine?.status).toBe('hidden');
    });

    it('leaves seeded (pre-v4) and other-status reels unaffected by the new status value', async () => {
      const token = await tokenFor('000000000000000000000012');
      const feed = await request(app.getHttpServer())
        .get('/api/reels?limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        (feed.body as FeedBody & { items: { status: string }[] }).items[0]
          .status,
      ).toBe('published');
    });
  });

  describe('reporting & auto-hide (FR-068–FR-072, v4)', () => {
    interface ReportBody {
      reported: boolean;
      alreadyReported: boolean;
    }
    interface HiddenListBody {
      items: {
        id: string;
        reportsCount: number;
        reports: { reporterId: string; reason: string }[];
      }[];
      nextCursor: string | null;
    }
    interface AdminModerationBody {
      id: string;
      status: string;
    }

    async function createPublishedReel(creatorId: string): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v4 report-test reel',
        hashtags: [],
        mentions: [],
        status: ReelStatus.PUBLISHED,
      });
      return doc._id.toString();
    }

    const ADMIN_KEY = 'e2e-admin-key';
    beforeAll(() => {
      process.env.ADMIN_API_KEY = ADMIN_KEY;
    });
    afterAll(() => {
      delete process.env.ADMIN_API_KEY;
    });

    it('records a report, no-ops on a duplicate from the same user, and rejects reporting your own reel', async () => {
      const ownerId = '000000000000000000000020';
      const ownerToken = await tokenFor(ownerId);
      const reporterToken = await tokenFor('000000000000000000000021');
      const reelId = await createPublishedReel(ownerId);

      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'spam' })
        .expect(400);

      const first = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'spam' })
        .expect(201);
      expect((first.body as ReportBody).alreadyReported).toBe(false);

      const duplicate = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'spam' })
        .expect(201);
      expect((duplicate.body as ReportBody).alreadyReported).toBe(true);
    });

    it('requires a non-empty customReason for "other" and rejects non-published reels', async () => {
      const ownerId = '000000000000000000000022';
      const reporterToken = await tokenFor('000000000000000000000023');
      const reelId = await createPublishedReel(ownerId);

      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'other' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'other', customReason: '   ' })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'other', customReason: 'a real reason' })
        .expect(201);

      const pendingId = await createRawReelHelper(ownerId, ReelStatus.PENDING_MODERATION);
      const otherToken = await tokenFor('000000000000000000000024');
      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/report`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ reason: 'spam' })
        .expect(404);
    });

    it('enforces the daily report rate limit and records nothing over it', async () => {
      process.env.REEL_REPORT_DAILY_LIMIT = '1';
      const ownerId = '000000000000000000000025';
      const reporterId = '000000000000000000000026';
      const reporterToken = await tokenFor(reporterId);
      const reelA = await createPublishedReel(ownerId);
      const reelB = await createPublishedReel(ownerId);

      await request(app.getHttpServer())
        .post(`/api/reels/${reelA}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'spam' })
        .expect(201);
      // A second report — on a DIFFERENT reel, so it isn't the dedup no-op path — hits the daily cap.
      await request(app.getHttpServer())
        .post(`/api/reels/${reelB}/report`)
        .set('Authorization', `Bearer ${reporterToken}`)
        .send({ reason: 'spam' })
        .expect(429);

      const reelBDoc = await reelModel.findById(reelB).exec();
      expect(reelBDoc?.reportsCount).toBe(0);
      delete process.env.REEL_REPORT_DAILY_LIMIT;
    });

    it('auto-hides at the threshold exactly once, preserves prior engagement, and is invisible everywhere but to the owner', async () => {
      process.env.REEL_REPORT_AUTOHIDE_THRESHOLD = '3';
      const ownerId = '000000000000000000000030';
      const ownerToken = await tokenFor(ownerId);
      const reelId = await createPublishedReel(ownerId);

      // Pre-hide engagement (a like) — must survive the hide untouched.
      const liker = await tokenFor('000000000000000000000031');
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${liker}`)
        .expect(201);

      // 3 unique reporters cross the threshold — the last one's response
      // never reveals that the hide fired (FR-070).
      for (const uid of [
        '000000000000000000000032',
        '000000000000000000000033',
        '000000000000000000000034',
      ]) {
        const t = await tokenFor(uid);
        await request(app.getHttpServer())
          .post(`/api/reels/${reelId}/report`)
          .set('Authorization', `Bearer ${t}`)
          .send({ reason: 'spam' })
          .expect(201);
      }

      const otherToken = await tokenFor('000000000000000000000035');
      await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
      const feed = await request(app.getHttpServer())
        .get(`/api/reels?creatorId=${ownerId}&limit=25`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect((feed.body as FeedBody).items.map((i) => i.id)).not.toContain(
        reelId,
      );

      const ownerFetch = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((ownerFetch.body as ReelBody & { status: string }).status).toBe(
        'hidden',
      );

      // Engagement recorded before the hide is untouched.
      const reelDoc = await reelModel.findById(reelId).exec();
      expect(reelDoc?.likesCount).toBe(1);

      delete process.env.REEL_REPORT_AUTOHIDE_THRESHOLD;
    });

    it('lists the hidden reel for an admin with its report reasons, and rejects a bad/missing key', async () => {
      process.env.REEL_REPORT_AUTOHIDE_THRESHOLD = '1';
      const ownerId = '000000000000000000000040';
      const reelId = await createPublishedReel(ownerId);
      const reporter = await tokenFor('000000000000000000000041');
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporter}`)
        .send({ reason: 'hate_speech' })
        .expect(201);

      await request(app.getHttpServer())
        .get('/api/reels/moderation/hidden')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/reels/moderation/hidden')
        .set('x-admin-key', 'wrong-key')
        .expect(401);

      const list = await request(app.getHttpServer())
        .get('/api/reels/moderation/hidden')
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);
      const entry = (list.body as HiddenListBody).items.find(
        (i) => i.id === reelId,
      );
      expect(entry).toBeTruthy();
      expect(entry?.reportsCount).toBe(1);
      expect(entry?.reports[0].reason).toBe('hate_speech');

      await request(app.getHttpServer())
        .patch(`/api/reels/${reelId}/moderation`)
        .send({ action: 'restore' })
        .expect(401);

      delete process.env.REEL_REPORT_AUTOHIDE_THRESHOLD;
    });

    it('restores a hidden reel with prior counts intact and makes it permanently immune to further auto-hides', async () => {
      process.env.REEL_REPORT_AUTOHIDE_THRESHOLD = '1';
      const ownerId = '000000000000000000000050';
      const ownerToken = await tokenFor(ownerId);
      const reelId = await createPublishedReel(ownerId);

      const liker = await tokenFor('000000000000000000000051');
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${liker}`)
        .expect(201);

      const reporter = await tokenFor('000000000000000000000052');
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporter}`)
        .send({ reason: 'spam' })
        .expect(201);
      const hiddenCheck = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((hiddenCheck.body as ReelBody & { status: string }).status).toBe(
        'hidden',
      );

      const restore = await request(app.getHttpServer())
        .patch(`/api/reels/${reelId}/moderation`)
        .set('x-admin-key', ADMIN_KEY)
        .send({ action: 'restore' })
        .expect(200);
      expect((restore.body as AdminModerationBody).status).toBe('published');

      // Restoring an already-published reel 409s (FR-071 precondition).
      await request(app.getHttpServer())
        .patch(`/api/reels/${reelId}/moderation`)
        .set('x-admin-key', ADMIN_KEY)
        .send({ action: 'restore' })
        .expect(409);

      // Prior engagement survived the hidden period untouched.
      const reelDoc = await reelModel.findById(reelId).exec();
      expect(reelDoc?.likesCount).toBe(1);

      // FR-070 "one auto-hide per reel ever": fresh reports (still above
      // threshold=1) never re-hide an admin-restored reel.
      const newReporter = await tokenFor('000000000000000000000053');
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${newReporter}`)
        .send({ reason: 'spam' })
        .expect(201);
      const stillPublished = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(
        (stillPublished.body as ReelBody & { status: string }).status,
      ).toBe('published');

      delete process.env.REEL_REPORT_AUTOHIDE_THRESHOLD;
    });

    it('rejects a hidden reel via the admin endpoint, adopting the existing rejected-reel presentation', async () => {
      process.env.REEL_REPORT_AUTOHIDE_THRESHOLD = '1';
      const ownerId = '000000000000000000000060';
      const ownerToken = await tokenFor(ownerId);
      const reelId = await createPublishedReel(ownerId);
      const reporter = await tokenFor('000000000000000000000061');
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/report`)
        .set('Authorization', `Bearer ${reporter}`)
        .send({ reason: 'violence' })
        .expect(201);

      const reject = await request(app.getHttpServer())
        .patch(`/api/reels/${reelId}/moderation`)
        .set('x-admin-key', ADMIN_KEY)
        .send({ action: 'reject' })
        .expect(200);
      expect((reject.body as AdminModerationBody).status).toBe('rejected');

      const ownerFetch = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect((ownerFetch.body as ReelBody & { status: string }).status).toBe(
        'rejected',
      );

      await request(app.getHttpServer())
        .patch('/api/reels/000000000000000000000fff/moderation')
        .set('x-admin-key', ADMIN_KEY)
        .send({ action: 'restore' })
        .expect(404);

      delete process.env.REEL_REPORT_AUTOHIDE_THRESHOLD;
    });

    // Shared with the "hidden visibility" describe block above — duplicated
    // locally (same shape) so this block has no cross-describe dependency.
    async function createRawReelHelper(
      creatorId: string,
      status: ReelStatus,
    ): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v4 test reel',
        hashtags: [],
        mentions: [],
        status,
      });
      return doc._id.toString();
    }
  });

  describe('repost & feed tabs (FR-073–FR-078, v4)', () => {
    interface RepostBody {
      reposted: boolean;
    }

    async function createPublishedReel(creatorId: string): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v4 repost-test reel',
        hashtags: [],
        mentions: [],
        status: ReelStatus.PUBLISHED,
      });
      return doc._id.toString();
    }

    it('reposts, no-ops on a duplicate, rejects self-repost, and un-reposts idempotently', async () => {
      const ownerId = '000000000000000000000070';
      const ownerToken = await tokenFor(ownerId);
      const reposterToken = await tokenFor('000000000000000000000071');
      const reelId = await createPublishedReel(ownerId);

      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);

      const first = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(201);
      expect((first.body as RepostBody).reposted).toBe(true);

      const duplicate = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(201);
      expect((duplicate.body as RepostBody).reposted).toBe(true);

      const unreposted = await request(app.getHttpServer())
        .delete(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(200);
      expect((unreposted.body as RepostBody).reposted).toBe(false);

      // Un-repost of nothing is a quiet no-op.
      const unrepostedAgain = await request(app.getHttpServer())
        .delete(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(200);
      expect((unrepostedAgain.body as RepostBody).reposted).toBe(false);
    });

    it('404s reposting a pending or hidden reel', async () => {
      const ownerId = '000000000000000000000072';
      const reposterToken = await tokenFor('000000000000000000000073');
      const pendingId = await createRawReelHelper(ownerId, ReelStatus.PENDING_MODERATION);
      const hiddenId = await createRawReelHelper(ownerId, ReelStatus.HIDDEN);

      await request(app.getHttpServer())
        .post(`/api/reels/${pendingId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/reels/${hiddenId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(404);
    });

    it('injects a followee repost into For You with attribution, dedups, excludes it from Following, and never notifies the creator', async () => {
      const viewerId = '000000000000000000000080';
      const followeeId = '000000000000000000000081';
      const creatorId = '000000000000000000000082';
      const viewerToken = await tokenFor(viewerId);
      const followeeToken = await tokenFor(followeeId);
      await tokenFor(creatorId);
      await userModel.findByIdAndUpdate(followeeId, { username: 'friendly_follower' });
      await followModel.create({
        followerId: new mongoose.Types.ObjectId(viewerId),
        followeeId: new mongoose.Types.ObjectId(followeeId),
      });

      const reelId = await createPublishedReel(creatorId);
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${followeeToken}`)
        .expect(201);

      const forYou = await request(app.getHttpServer())
        .get('/api/reels?limit=25')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const occurrences = (forYou.body as FeedBody).items.filter((i) => i.id === reelId);
      expect(occurrences).toHaveLength(1);
      expect(
        (occurrences[0] as unknown as { repostedBy: { username: string } | null })
          .repostedBy?.username,
      ).toBe('friendly_follower');

      const following = await request(app.getHttpServer())
        .get('/api/reels/following?limit=25')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const followingItems = following.body as unknown as {
        items: { id: string; repostedBy: unknown }[];
      };
      expect(followingItems.items.every((i) => i.repostedBy === null)).toBe(true);
      expect(followingItems.items.map((i) => i.id)).not.toContain(reelId);

      // Reposting never notifies the creator (FR-073).
      const events = await notificationEventModel.find({ reelId: new mongoose.Types.ObjectId(reelId) }).exec();
      expect(events).toHaveLength(0);

      // Un-repost -> injection gone on the next fetch.
      await request(app.getHttpServer())
        .delete(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${followeeToken}`)
        .expect(200);
      const afterUnrepost = await request(app.getHttpServer())
        .get('/api/reels?limit=25')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const stillThere = (afterUnrepost.body as FeedBody).items.find((i) => i.id === reelId);
      expect(
        (stillThere as unknown as { repostedBy: unknown } | undefined)?.repostedBy ?? null,
      ).toBeNull();
    });

    it('suppresses the injection when the viewer blocks the reposter, and marks own reposts "you"', async () => {
      const viewerId = '000000000000000000000090';
      const reposterId = '000000000000000000000091';
      const creatorId = '000000000000000000000092';
      const viewerToken = await tokenFor(viewerId);
      const reposterToken = await tokenFor(reposterId);
      await tokenFor(creatorId);
      await followModel.create({
        followerId: new mongoose.Types.ObjectId(viewerId),
        followeeId: new mongoose.Types.ObjectId(reposterId),
      });

      const reelId = await createPublishedReel(creatorId);
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(201);

      // Own repost shows self-attribution.
      const ownReelId = await createPublishedReel(creatorId);
      await request(app.getHttpServer())
        .post(`/api/reels/${ownReelId}/repost`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(201);
      const feedBeforeBlock = await request(app.getHttpServer())
        .get('/api/reels?limit=25')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const ownItem = (feedBeforeBlock.body as FeedBody).items.find((i) => i.id === ownReelId);
      expect(
        (ownItem as unknown as { repostedBy: { id: string } | null })?.repostedBy?.id,
      ).toBe(viewerId);

      // Block the reposter — the reposter-edge suppression applies (FR-078)
      // independent of the (unblocked) creator edge.
      await request(app.getHttpServer())
        .post(`/api/users/${reposterId}/block`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(201);
      const feedAfterBlock = await request(app.getHttpServer())
        .get('/api/reels?limit=25')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const suppressed = (feedAfterBlock.body as FeedBody).items.find((i) => i.id === reelId);
      expect(
        (suppressed as unknown as { repostedBy: unknown } | undefined)?.repostedBy ?? null,
      ).toBeNull();
    });

    async function createRawReelHelper(
      creatorId: string,
      status: ReelStatus,
    ): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v4 test reel',
        hashtags: [],
        mentions: [],
        status,
      });
      return doc._id.toString();
    }
  });

  describe('upload & moderation (FR-060–FR-067, v3)', () => {
    it('publishes a clean upload and fires exactly one mention notification at publish time', async () => {
      const uploaderId = '000000000000000000000010';
      const uploaderToken = await tokenFor(uploaderId);
      const otherToken = await tokenFor('000000000000000000000011');

      // A real seeded creator to @mention (seed data guarantees 'lina.k').
      const upload = await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .field('description', 'hello world #v3test feat. @lina.k')
        .attach('video', makeTestVideoBuffer(2), {
          filename: 'clean.wav',
          contentType: 'video/mp4',
        })
        .expect(201);
      const created = upload.body as ReelBody & { status: string };
      expect(created.status).toBe('pending_moderation');
      const reelId = created.id;

      // Non-owner: invisible while pending (FR-061). The real BullMQ Worker
      // is paused for this suite (see beforeAll), so this is deterministic.
      await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      // Direct processor invocation (plan.md T125) — deterministic, no
      // reliance on live-queue timing.
      await moderationService.moderateReel(reelId);

      const publishedFetch = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);
      expect((publishedFetch.body as ReelBody & { status: string }).status).toBe(
        'published',
      );

      const lina = await userModel.findOne({ username: 'lina.k' }).exec();
      // Mongoose's automatic string→ObjectId query casting doesn't apply
      // here (a pre-existing project-wide characteristic — every ObjectId
      // `@Prop` resolves to a `Mixed` schema path under this project's
      // mongoose version, including reel.schema.ts's `creatorId`; the rest
      // of the codebase always constructs real ObjectIds before querying —
      // see reels-db.repository.ts's `toObjectId()` — so this follows suit).
      const mentionEvents = await notificationEventModel
        .find({
          type: 'reelMention',
          reelId: new mongoose.Types.ObjectId(reelId),
          recipientId: lina!._id,
        })
        .exec();
      expect(mentionEvents).toHaveLength(1);
    });

    it('rejects a flagged upload, never sends its mentions, and hides it from non-owners', async () => {
      const uploaderId = '000000000000000000000012';
      const uploaderToken = await tokenFor(uploaderId);
      const otherToken = await tokenFor('000000000000000000000013');

      // The stub provider's filename check runs against the on-disk name,
      // which Multer deliberately randomizes (never the client-declared
      // original filename — a standard anti-path-traversal/collision
      // practice, matching StatusController's upload pattern). The
      // description marker is therefore the only reliable trigger through
      // the real upload endpoint; quickstart.md documents this the same way.
      const upload = await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .field('description', 'flagged upload nsfw-test feat. @lina.k')
        .attach('video', makeTestVideoBuffer(2), {
          filename: 'clean3.wav',
          contentType: 'video/mp4',
        })
        .expect(201);
      const reelId = (upload.body as ReelBody).id;

      await moderationService.moderateReel(reelId);

      const ownerFetch = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .expect(200);
      expect((ownerFetch.body as ReelBody & { status: string }).status).toBe(
        'rejected',
      );

      await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      const lina = await userModel.findOne({ username: 'lina.k' }).exec();
      const mentionEvents = await notificationEventModel
        .find({
          type: 'reelMention',
          reelId: new mongoose.Types.ObjectId(reelId),
          recipientId: lina!._id,
        })
        .exec();
      expect(mentionEvents).toHaveLength(0);

      const rejectionEvents = await notificationEventModel
        .find({
          type: 'reelRejected',
          reelId: new mongoose.Types.ObjectId(reelId),
          recipientId: new mongoose.Types.ObjectId(uploaderId),
        })
        .exec();
      expect(rejectionEvents).toHaveLength(1);
      expect(rejectionEvents[0].actorId).toBeFalsy();
    });

    it('rejects an over-60-second upload with 400 and creates no reel', async () => {
      const uploaderToken = await tokenFor('000000000000000000000014');
      const before = await reelModel.countDocuments().exec();

      await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('video', makeTestVideoBuffer(90), {
          filename: 'too-long.wav',
          contentType: 'video/mp4',
        })
        .expect(400);

      const after = await reelModel.countDocuments().exec();
      expect(after).toBe(before);
    });

    it('rejects an upload with no video file with 400', async () => {
      const uploaderToken = await tokenFor('000000000000000000000015');
      await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .field('description', 'no video attached')
        .expect(400);
    });

    it('suppresses a mention when the mentioned user blocks the uploader before the verdict lands', async () => {
      const uploaderId = '000000000000000000000016';
      const uploaderToken = await tokenFor(uploaderId);
      const lina = await userModel.findOne({ username: 'lina.k' }).exec();

      const upload = await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .field('description', 'shout out @lina.k')
        .attach('video', makeTestVideoBuffer(2), {
          filename: 'clean2.wav',
          contentType: 'video/mp4',
        })
        .expect(201);
      const reelId = (upload.body as ReelBody).id;

      // lina.k blocks the uploader while the reel is still pending review.
      const linaToken = await tokenFor(lina!._id.toString());
      await request(app.getHttpServer())
        .post(`/api/users/${uploaderId}/block`)
        .set('Authorization', `Bearer ${linaToken}`)
        .expect(201);

      await moderationService.moderateReel(reelId);

      const mentionEvents = await notificationEventModel
        .find({
          type: 'reelMention',
          reelId: new mongoose.Types.ObjectId(reelId),
          recipientId: lina!._id,
        })
        .exec();
      expect(mentionEvents).toHaveLength(0);

      // Unblock so this test doesn't leak state into later ones re-using lina.k.
      await request(app.getHttpServer())
        .post(`/api/users/${uploaderId}/block`)
        .set('Authorization', `Bearer ${linaToken}`)
        .expect(201);
    });

    it('lets the owner delete a published reel — it 404s everywhere and counters adjust', async () => {
      const uploaderId = '000000000000000000000017';
      const uploaderToken = await tokenFor(uploaderId);
      const otherToken = await tokenFor('000000000000000000000018');

      const upload = await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('video', makeTestVideoBuffer(2), {
          filename: 'to-delete.wav',
          contentType: 'video/mp4',
        })
        .expect(201);
      const reelId = (upload.body as ReelBody).id;
      await moderationService.moderateReel(reelId);

      // Someone likes it before it's deleted.
      await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .expect(404);

      const uploader = await userModel.findById(uploaderId).exec();
      expect(uploader?.totalLikes).toBe(0);
    });

    it('rejects deletion by a non-owner with 403', async () => {
      const uploaderToken = await tokenFor('000000000000000000000019');
      const otherToken = await tokenFor('000000000000000000000020');

      const upload = await request(app.getHttpServer())
        .post('/api/reels')
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('video', makeTestVideoBuffer(2), {
          filename: 'not-yours.wav',
          contentType: 'video/mp4',
        })
        .expect(201);
      const reelId = (upload.body as ReelBody).id;

      await request(app.getHttpServer())
        .delete(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });
  });

  describe('followed-users list (FR-084, v5)', () => {
    interface FollowingUsersBody {
      items: { id: string; username: string; name: string; avatarUrl: string }[];
      nextCursor: string | null;
    }

    it('requires auth', async () => {
      await request(app.getHttpServer())
        .get('/api/reels/me/following')
        .expect(401);
    });

    it('returns followees most-recently-followed first, paginates, and excludes blocked followees', async () => {
      const viewerId = '0000000000000000000000a0';
      const followeeAId = '0000000000000000000000a1';
      const followeeBId = '0000000000000000000000a2';
      const blockedFolloweeId = '0000000000000000000000a3';
      const viewerToken = await tokenFor(viewerId);
      await tokenFor(followeeAId);
      await tokenFor(followeeBId);
      await tokenFor(blockedFolloweeId);
      await userModel.findByIdAndUpdate(followeeAId, {
        username: 'alice',
        name: 'Alice A',
      });
      await userModel.findByIdAndUpdate(followeeBId, {
        username: 'bob',
        name: 'Bob B',
      });
      await userModel.findByIdAndUpdate(blockedFolloweeId, {
        username: 'blocked_user',
        name: 'Blocked User',
      });

      // Followed in order A, then blocked, then B — B is most recent.
      await followModel.create({
        followerId: new mongoose.Types.ObjectId(viewerId),
        followeeId: new mongoose.Types.ObjectId(followeeAId),
      });
      await followModel.create({
        followerId: new mongoose.Types.ObjectId(viewerId),
        followeeId: new mongoose.Types.ObjectId(blockedFolloweeId),
      });
      await followModel.create({
        followerId: new mongoose.Types.ObjectId(viewerId),
        followeeId: new mongoose.Types.ObjectId(followeeBId),
      });
      await request(app.getHttpServer())
        .post(`/api/users/${blockedFolloweeId}/block`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(201);

      const page1 = await request(app.getHttpServer())
        .get('/api/reels/me/following?limit=1')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const body1 = page1.body as FollowingUsersBody;
      expect(body1.items).toHaveLength(1);
      expect(body1.items[0].username).toBe('bob');
      expect(body1.nextCursor).not.toBeNull();

      const page2 = await request(app.getHttpServer())
        .get(`/api/reels/me/following?limit=1&cursor=${body1.nextCursor}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const body2 = page2.body as FollowingUsersBody;
      expect(body2.items).toHaveLength(1);
      expect(body2.items[0].username).toBe('alice');
      // Blocked followee never appears across either page.
      expect(body1.items.map((i) => i.username)).not.toContain('blocked_user');
      expect(body2.items.map((i) => i.username)).not.toContain('blocked_user');
    });

    it('returns an empty page when the viewer follows no one', async () => {
      const viewerToken = await tokenFor('0000000000000000000000b0');
      const res = await request(app.getHttpServer())
        .get('/api/reels/me/following')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      expect((res.body as FollowingUsersBody).items).toEqual([]);
      expect((res.body as FollowingUsersBody).nextCursor).toBeNull();
    });
  });

  describe('public reposts list (v6)', () => {
    async function createPublishedReel(creatorId: string): Promise<string> {
      const doc = await reelModel.create({
        creatorId: new mongoose.Types.ObjectId(creatorId),
        videoUrl: '/uploads/reels/videos/test.mp4',
        thumbnailUrl: '/uploads/reels/thumbs/test.jpg',
        description: 'a v6 reposts-list reel',
        hashtags: [],
        mentions: [],
        status: ReelStatus.PUBLISHED,
      });
      return doc._id.toString();
    }

    interface FeedItem {
      id: string;
      repostedBy: { id: string; name: string } | null;
    }
    interface RepostsBody {
      items: FeedItem[];
      nextCursor: string | null;
    }

    it('requires auth', async () => {
      await request(app.getHttpServer()).get('/api/reels/reposted').expect(401);
    });

    it("is public — returns a target user's reposts (newest-first) to any viewer, dropping ones that left published", async () => {
      const reposterId = '0000000000000000000000c0';
      const creatorId = '0000000000000000000000c1';
      const viewerToken = await tokenFor('0000000000000000000000c2');
      const reposterToken = await tokenFor(reposterId);
      await tokenFor(creatorId);

      const reelA = await createPublishedReel(creatorId);
      const reelB = await createPublishedReel(creatorId);
      await request(app.getHttpServer())
        .post(`/api/reels/${reelA}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/reels/${reelB}/repost`)
        .set('Authorization', `Bearer ${reposterToken}`)
        .expect(201);

      // A different viewer sees the reposter's public reposts, newest-first,
      // each attributed to the reposter (drives the "[name] reposted" badge).
      const res = await request(app.getHttpServer())
        .get(`/api/reels/reposted?userId=${reposterId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      const items = (res.body as RepostsBody).items;
      expect(items.map((i) => i.id)).toEqual([reelB, reelA]);
      expect(items.every((i) => i.repostedBy?.id === reposterId)).toBe(true);

      // A reposted reel that leaves the published state drops out of the list.
      await reelModel.updateOne(
        { _id: new mongoose.Types.ObjectId(reelB) },
        { status: ReelStatus.HIDDEN },
      );
      const after = await request(app.getHttpServer())
        .get(`/api/reels/reposted?userId=${reposterId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
      expect(after.body.items.map((i: FeedItem) => i.id)).toEqual([reelA]);
    });

    it('defaults to the caller when userId is omitted, and empty when nothing is reposted', async () => {
      const selfId = '0000000000000000000000d0';
      const creatorId = '0000000000000000000000d1';
      const selfToken = await tokenFor(selfId);
      await tokenFor(creatorId);

      const empty = await request(app.getHttpServer())
        .get('/api/reels/reposted')
        .set('Authorization', `Bearer ${selfToken}`)
        .expect(200);
      expect((empty.body as RepostsBody).items).toEqual([]);

      const reel = await createPublishedReel(creatorId);
      await request(app.getHttpServer())
        .post(`/api/reels/${reel}/repost`)
        .set('Authorization', `Bearer ${selfToken}`)
        .expect(201);
      const mine = await request(app.getHttpServer())
        .get('/api/reels/reposted')
        .set('Authorization', `Bearer ${selfToken}`)
        .expect(200);
      expect((mine.body as RepostsBody).items.map((i) => i.id)).toEqual([reel]);
    });
  });

  describe('public store-redirect page (FR-039a, no auth)', () => {
    it('serves HTML without a token', async () => {
      const res = await request(app.getHttpServer())
        .get('/reels/some-id')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });
});
