import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ReelsModule } from '../src/modules/reels/reels.module';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';

interface FeedBody {
  items: { id: string }[];
  nextCursor: string | null;
}
interface ReelBody {
  id: string;
  viewerLiked: boolean;
}
interface LikeBody {
  liked: boolean;
}
interface CommentPostBody {
  comment: { text: string };
}
interface ShareBody {
  sharesCount: number;
}
interface ProfileBody {
  user: { id: string };
}
interface FollowBody {
  following: boolean;
}

/**
 * Isolated e2e coverage for the Reels module (021-reels-video-feed).
 * Deliberately does NOT import AppModule (which requires a live MongoDB +
 * Redis connection) — spins up just enough of the real auth stack
 * (PassportModule + JwtModule + the real JwtStrategy) alongside ReelsModule
 * so requests exercise the actual JwtAuthGuard, not a stub.
 */
describe('Reels module (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PassportModule,
        // Mirrors AuthModule's real registration exactly so the token this
        // test signs is validated with the same resolved secret the
        // JwtStrategy uses — whatever JWT_SECRET happens to be in the
        // environment (or its 'default-secret' fallback).
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

    jwtService = moduleFixture.get(JwtService);
    token = jwtService.sign({
      sub: 'mock-user-1',
      phoneNumber: '+10000000000',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('auth guard', () => {
    it('rejects GET /api/reels with no token', () => {
      return request(app.getHttpServer()).get('/api/reels').expect(401);
    });

    it('rejects POST /api/reels/:id/like with no token', () => {
      return request(app.getHttpServer())
        .post('/api/reels/reel-1/like')
        .expect(401);
    });

    it('rejects GET /api/users/:id/profile with no token', () => {
      return request(app.getHttpServer())
        .get('/api/users/mock-user-1/profile')
        .expect(401);
    });
  });

  describe('happy path: feed → like → comment → share → profile → follow', () => {
    it('walks the full flow end-to-end with a real signed token', async () => {
      const feed = await request(app.getHttpServer())
        .get('/api/reels?limit=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const feedBody = feed.body as FeedBody;
      expect(feedBody.items).toHaveLength(5);
      expect(feedBody.nextCursor).not.toBeNull();
      const reelId = feedBody.items[0].id;

      const single = await request(app.getHttpServer())
        .get(`/api/reels/${reelId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const singleBody = single.body as ReelBody;
      expect(singleBody.id).toBe(reelId);

      // Seed data may already have this viewer/reel pair liked — assert the
      // toggle flips it, not a fixed target state.
      const wasLiked = singleBody.viewerLiked;
      const like = await request(app.getHttpServer())
        .post(`/api/reels/${reelId}/like`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((like.body as LikeBody).liked).toBe(!wasLiked);

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
        .get('/api/users/mock-user-3/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((profile.body as ProfileBody).user.id).toBe('mock-user-3');

      const follow = await request(app.getHttpServer())
        .post('/api/users/mock-user-3/follow')
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect((follow.body as FollowBody).following).toBe(true);
    });

    it('rejects following yourself with 400', () => {
      return request(app.getHttpServer())
        .post('/api/users/mock-user-1/follow')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rejects an empty comment with 400', () => {
      return request(app.getHttpServer())
        .post('/api/reels/reel-1/comments')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '   ' })
        .expect(400);
    });
  });

  describe('public store-redirect page (FR-039a, no auth)', () => {
    it('serves HTML without a token', async () => {
      const res = await request(app.getHttpServer())
        .get('/reels/reel-1')
        .expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('reel-1');
    });
  });
});
