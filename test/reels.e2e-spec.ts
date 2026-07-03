import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { App } from 'supertest/types';
import { ReelsModule } from '../src/modules/reels/reels.module';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { User, UserDocument } from '../src/modules/users/schemas/user.schema';

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

  describe('public store-redirect page (FR-039a, no auth)', () => {
    it('serves HTML without a token', async () => {
      const res = await request(app.getHttpServer())
        .get('/reels/some-id')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });
});
