import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { AuthService, AUTH_ERR_REVOKED } from './auth.service';
import { AuthModule } from './auth.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { UsersService } from '../users/users.service';
import { DeviceTokensRepository } from '../notifications/device-tokens.repository';
import { FamilyLink } from '../family-core/schemas/family-link.schema';
import { FamilyCoreModule } from '../family-core/family-core.module';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/** 026 (T162, research R8): per-device watch sessions and the refresh-token hardening. */
describe('AuthService device sessions (026)', () => {
  const userId = new Types.ObjectId();
  const user = {
    _id: userId,
    name: 'Sara',
    phoneNumber: '+9665',
    refreshToken: 'phone-refresh',
    toObject: () => ({
      _id: userId,
      name: 'Sara',
      password: 'x',
      refreshToken: 'y',
    }),
  };

  let service: AuthService;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let users: Record<string, jest.Mock>;
  let sessions: Record<string, jest.Mock>;
  let tokens: Record<string, jest.Mock>;
  let familyLinks: { findOne: jest.Mock };
  let counter: number;
  let linked: boolean;

  beforeEach(async () => {
    counter = 0;
    linked = true;
    jwt = {
      signAsync: jest.fn(() => Promise.resolve(`tok-${++counter}`)),
      verifyAsync: jest.fn(),
    };
    users = {
      findById: jest.fn().mockResolvedValue(user),
      updateRefreshToken: jest.fn(),
    };
    sessions = {
      create: jest.fn().mockResolvedValue({}),
      findById: jest.fn(),
      rotate: jest.fn(),
      revokeActiveForUser: jest.fn().mockResolvedValue(true),
    };
    tokens = {
      deleteByUserAndPlatform: jest.fn().mockResolvedValue(undefined),
    };
    familyLinks = {
      findOne: jest.fn(() => ({
        exec: () => Promise.resolve(linked ? { status: 'active' } : null),
      })),
    };
    const mod = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((k: string) => (k === 'JWT_SECRET' ? 's' : null)),
          },
        },
        { provide: 'REDIS_CLIENT', useValue: {} },
        { provide: AuthSessionsRepository, useValue: sessions },
        { provide: DeviceTokensRepository, useValue: tokens },
        { provide: getModelToken(FamilyLink.name), useValue: familyLinks },
      ],
    }).compile();
    service = mod.get(AuthService);
  });

  const errMessage = async (p: Promise<unknown>) =>
    (
      (await p.then(
        () => null,
        (e: unknown) => e,
      )) as UnauthorizedException | null
    )?.message;

  describe('createDeviceSession', () => {
    it('returns tokens carrying `sid`, stores only the refresh token hash, and leaves the phone token alone', async () => {
      const res = await service.createDeviceSession(userId.toString());
      expect(res.sessionId).toMatch(/^[0-9a-f]{24}$/);
      const [accessPayload] = jwt.signAsync.mock.calls[0];
      const [refreshPayload] = jwt.signAsync.mock.calls[1];
      expect(accessPayload).toMatchObject({
        sub: userId.toString(),
        sid: res.sessionId,
      });
      expect(accessPayload.typ).toBeUndefined();
      expect(refreshPayload).toMatchObject({
        sid: res.sessionId,
        typ: 'refresh',
      });
      expect(accessPayload.jti).not.toBe(refreshPayload.jti);
      expect(sessions.create).toHaveBeenCalledWith(
        userId.toString(),
        sha(res.refreshToken),
        expect.anything(),
      );
      expect(users.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('revokes the previous watch session as `replaced` and deletes the user’s apns-watch tokens', async () => {
      await service.createDeviceSession(userId.toString());
      expect(sessions.revokeActiveForUser).toHaveBeenCalledWith(
        userId.toString(),
        'replaced',
      );
      expect(tokens.deleteByUserAndPlatform).toHaveBeenCalledWith(
        userId.toString(),
        'apns-watch',
      );
      expect(
        sessions.revokeActiveForUser.mock.invocationCallOrder[0],
      ).toBeLessThan(sessions.create.mock.invocationCallOrder[0]);
    });

    it('a non-child gets 403 WATCH_REQUIRES_LINKED_CHILD', async () => {
      linked = false;
      const err = (await service.createDeviceSession(userId.toString()).then(
        () => null,
        (e: unknown) => e,
      )) as { getStatus: () => number; getResponse: () => { error: string } };
      expect(err.getStatus()).toBe(403);
      expect(err.getResponse().error).toBe('WATCH_REQUIRES_LINKED_CHILD');
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('reads family_links directly with the child id and active status', async () => {
      await service.createDeviceSession(userId.toString());
      expect(familyLinks.findOne).toHaveBeenCalledWith({
        childUserId: userId,
        status: 'active',
      });
    });
  });

  describe('refreshTokens with a session id', () => {
    const sid = new Types.ObjectId();
    const oldToken = 'watch-refresh-1';
    const session = () => ({
      _id: sid,
      userId,
      status: 'active',
      refreshTokenHash: sha(oldToken),
    });

    beforeEach(() => {
      jwt.verifyAsync.mockResolvedValue({
        sub: userId.toString(),
        sid: sid.toString(),
      });
      sessions.findById.mockResolvedValue(session());
      sessions.rotate.mockResolvedValue({});
    });

    it('rotates the hash inside that session and never touches the phone’s refresh token', async () => {
      const res = await service.refreshTokens({ refreshToken: oldToken });
      expect(sessions.rotate).toHaveBeenCalledWith(
        sid,
        sha(oldToken),
        sha(res.refreshToken),
      );
      expect(res.refreshToken).not.toBe(oldToken);
      expect(users.updateRefreshToken).not.toHaveBeenCalled();
      const [payload] = jwt.signAsync.mock.calls[1];
      expect(payload).toMatchObject({ sid: sid.toString(), typ: 'refresh' });
      expect(res.user).not.toHaveProperty('password');
    });

    it('reusing an old token → 401 "Refresh token revoked"', async () => {
      sessions.findById.mockResolvedValue({
        ...session(),
        refreshTokenHash: sha('already-rotated'),
      });
      expect(
        await errMessage(service.refreshTokens({ refreshToken: oldToken })),
      ).toBe(AUTH_ERR_REVOKED);
      expect(sessions.rotate).not.toHaveBeenCalled();
    });

    it('losing a concurrent rotation → 401 "Refresh token revoked"', async () => {
      sessions.rotate.mockResolvedValue(null);
      expect(
        await errMessage(service.refreshTokens({ refreshToken: oldToken })),
      ).toBe(AUTH_ERR_REVOKED);
    });

    it('a revoked or missing session, or one that belongs to someone else → 401 revoked', async () => {
      sessions.findById.mockResolvedValue({ ...session(), status: 'revoked' });
      expect(
        await errMessage(service.refreshTokens({ refreshToken: oldToken })),
      ).toBe(AUTH_ERR_REVOKED);
      sessions.findById.mockResolvedValue(null);
      expect(
        await errMessage(service.refreshTokens({ refreshToken: oldToken })),
      ).toBe(AUTH_ERR_REVOKED);
      sessions.findById.mockResolvedValue({
        ...session(),
        userId: new Types.ObjectId(),
      });
      expect(
        await errMessage(service.refreshTokens({ refreshToken: oldToken })),
      ).toBe(AUTH_ERR_REVOKED);
    });

    it('a malformed or expired token keeps the other terminal message', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      expect(
        await errMessage(service.refreshTokens({ refreshToken: 'x' })),
      ).toBe('Invalid or expired refresh token');
    });
  });

  describe('legacy phone refresh path', () => {
    it('is unchanged: validated against the user’s single stored token, which is then rotated', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: userId.toString() });
      const res = await service.refreshTokens({
        refreshToken: 'phone-refresh',
      });
      expect(sessions.findById).not.toHaveBeenCalled();
      expect(users.updateRefreshToken).toHaveBeenCalledWith(
        userId.toString(),
        res.refreshToken,
      );
    });

    it('still rejects a stale phone token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: userId.toString() });
      expect(
        await errMessage(service.refreshTokens({ refreshToken: 'old' })),
      ).toBe(AUTH_ERR_REVOKED);
    });

    it('newly minted refresh tokens carry typ: "refresh"; access tokens do not (F5)', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: userId.toString() });
      await service.refreshTokens({ refreshToken: 'phone-refresh' });
      const [access] = jwt.signAsync.mock.calls[0];
      const [refresh] = jwt.signAsync.mock.calls[1];
      expect(refresh.typ).toBe('refresh');
      expect(access.typ).toBeUndefined();
    });
  });

  describe('revokeDeviceSession', () => {
    it('is idempotent and deletes the user’s apns-watch device tokens', async () => {
      sessions.revokeActiveForUser.mockResolvedValue(false);
      await service.revokeDeviceSession(userId.toString(), 'logout');
      await service.revokeDeviceSession(userId.toString(), 'logout');
      expect(sessions.revokeActiveForUser).toHaveBeenCalledWith(
        userId.toString(),
        'logout',
      );
      expect(tokens.deleteByUserAndPlatform).toHaveBeenCalledTimes(2);
      expect(tokens.deleteByUserAndPlatform).toHaveBeenCalledWith(
        userId.toString(),
        'apns-watch',
      );
    });
  });

  describe('JwtStrategy hardening', () => {
    const strategy = (active = true) =>
      new JwtStrategy(
        { get: () => 'secret' } as never,
        { isActive: jest.fn().mockResolvedValue(active) } as never,
      );

    it('rejects a refresh token used as a bearer token (F5)', async () => {
      await expect(
        strategy().validate({ sub: 'u1', phoneNumber: '+1', typ: 'refresh' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts an ordinary access token', async () => {
      await expect(
        strategy().validate({ sub: 'u1', phoneNumber: '+1' }),
      ).resolves.toEqual({ userId: 'u1', phoneNumber: '+1' });
    });

    it('a watch access token stops working the moment its session is revoked', async () => {
      await expect(
        strategy(false).validate({ sub: 'u1', phoneNumber: '+1', sid: 's1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        strategy(true).validate({ sub: 'u1', phoneNumber: '+1', sid: 's1' }),
      ).resolves.toBeDefined();
    });

    it('still builds with only a ConfigService (older test setups)', async () => {
      const bare = new JwtStrategy({ get: () => 'secret' } as never);
      await expect(
        bare.validate({ sub: 'u1', phoneNumber: '+1', sid: 's1' }),
      ).resolves.toBeDefined();
    });
  });

  it('AuthModule does not import FamilyCoreModule: FamilyCore → Chat → Auth would be a module cycle', () => {
    const imports = Reflect.getMetadata('imports', AuthModule) as unknown[];
    expect(imports).not.toContain(FamilyCoreModule);
    expect(
      imports.some(
        (m) =>
          (m as { module?: unknown }).module
            ?.toString()
            .includes('MongooseModule') ||
          (m as { name?: string }).name === 'MongooseModule',
      ),
    ).toBe(true);
  });
});
