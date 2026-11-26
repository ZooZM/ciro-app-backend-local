import {
  Injectable,
  UnauthorizedException,
  Inject,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { SessionRevokedReason } from './schemas/auth-session.schema';
import {
  FamilyLink,
  FamilyLinkDocument,
} from '../family-core/schemas/family-link.schema';
import { DeviceTokensRepository } from '../notifications/device-tokens.repository';
import { watchRequiresLinkedChild } from '../family-core/allowance-errors';

// Load-bearing per Flutter contract (specs/009-persistent-session): the Flutter
// client treats these two 401 message strings as the only terminal session signals.
// Any rename here MUST be coordinated with TokenRefreshService._isRevocationResponse().
export const AUTH_ERR_REVOKED = 'Refresh token revoked';
export const AUTH_ERR_INVALID_OR_EXPIRED = 'Invalid or expired refresh token';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject('REDIS_CLIENT') private redisClient: Redis,
    // 026 (research R8): per-device watch sessions. Optional so the phone-only
    // flows (and their older tests) keep working without them.
    @Optional() private authSessions?: AuthSessionsRepository,
    @Optional() private deviceTokens?: DeviceTokensRepository,
    // Read directly instead of importing FamilyCoreModule: that module imports
    // ChatModule, which already imports AuthModule, so importing it would be a cycle.
    @Optional()
    @InjectModel(FamilyLink.name)
    private familyLinks?: Model<FamilyLinkDocument>,
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string }> {
    const { phoneNumber } = sendOtpDto;

    // TODO: TEMPORARY WORKAROUND - REMOVE BEFORE PRODUCTION
    // Hardcode OTP to 123456 and log to specific fixed email for testing
    const otp = '123456';
    const fixedEmail = 'zeyadmostafa201@gmail.com';

    // Save to Redis with 3-minute expiration (180 seconds)
    await this.redisClient.set(phoneNumber, otp, 'EX', 180);

    // In a real app, integrate SMS provider (Twilio/Firebase)
    console.log(
      `[OTP GENERATED] sending to fixed email: ${fixedEmail} (requested for: ${phoneNumber}), code: ${otp}`,
    );

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phoneNumber, code } = verifyOtpDto;

    const storedOtp = await this.redisClient.get(phoneNumber);
    if (!storedOtp || storedOtp !== code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Check if user exists, if not create
    let user = await this.usersService.findByPhoneNumber(phoneNumber);
    if (!user) {
      user = await this.usersService.create({
        phoneNumber,
        name: 'New User', // Default name until they update their profile
        isPhoneVerified: true,
      });
    } else if (!user.isPhoneVerified) {
      // If it exists but wasn't verified, verify it
      user.isPhoneVerified = true;
      await user.save();
    }

    // Clear the OTP
    await this.redisClient.del(phoneNumber);

    return this.generateAuthResponse(user);
  }

  async register(registerDto: RegisterDto) {
    const { name, phoneNumber, email, password } = registerDto;

    // Check if user already exists
    if (phoneNumber) {
      const existingPhone =
        await this.usersService.findByPhoneNumber(phoneNumber);
      if (existingPhone)
        throw new ConflictException(
          'User with this phone number already exists',
        );
    }
    if (email) {
      const existingEmail = await this.usersService.findByEmail(email);
      if (existingEmail)
        throw new ConflictException('User with this email already exists');
    }

    // usersService.create handles bcrypt hashing internally
    const user = await this.usersService.create({
      name,
      phoneNumber,
      email,
      password,
      isPhoneVerified: false,
    });

    return this.generateAuthResponse(user);
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    let payload: { sub: string; phoneNumber: string; sid?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret:
          this.configService.get<string>('JWT_SECRET') || 'default-secret',
      });
    } catch {
      throw new UnauthorizedException(AUTH_ERR_INVALID_OR_EXPIRED);
    }

    const user = await this.usersService.findById(payload.sub);

    // 026: a token with `sid` belongs to a device session and rotates inside it.
    if (payload.sid) {
      if (!user) throw new UnauthorizedException(AUTH_ERR_REVOKED);
      return this.refreshDeviceSession(user, payload.sid, refreshToken);
    }

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedException(AUTH_ERR_REVOKED);
    }

    return this.generateAuthResponse(user);
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Signs an access/refresh pair that carries the session id and a unique `jti`. */
  private async signSessionTokens(user: any, sessionId: string) {
    const payload = {
      sub: user._id.toString(),
      phoneNumber: user.phoneNumber,
      name: user.name,
      sid: sessionId,
    };
    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '365d';
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        { expiresIn: accessTokenExpiresIn as any },
      ),
      this.jwtService.signAsync(
        { ...payload, typ: 'refresh', jti: randomUUID() },
        { expiresIn: refreshTokenExpiresIn as any },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * 026 (R8, contracts/rest-api.md): mints a watch session for a linked child.
   * Any previous watch session is revoked (`replaced`). The phone's own
   * refresh token is untouched.
   */
  async createDeviceSession(userId: string) {
    // An explicit ObjectId: these schemas do not auto-cast a string in a filter.
    const link = await this.familyLinks!.findOne({
      childUserId: new Types.ObjectId(userId),
      status: 'active',
    }).exec();
    if (!link) throw watchRequiresLinkedChild();
    const user = await this.usersService.findById(userId);
    if (!user) throw watchRequiresLinkedChild();

    await this.revokeDeviceSession(userId, 'replaced');
    const sessionId = new Types.ObjectId();
    const tokens = await this.signSessionTokens(user, sessionId.toString());
    await this.authSessions!.create(
      userId,
      this.sha256(tokens.refreshToken),
      sessionId,
    );
    return { sessionId: sessionId.toString(), ...tokens };
  }

  /**
   * Idempotent. Also deletes the user's `apns-watch` device tokens so a
   * signed-out watch gets no more background pushes.
   */
  async revokeDeviceSession(
    userId: string,
    reason: SessionRevokedReason,
  ): Promise<void> {
    await this.authSessions!.revokeActiveForUser(userId, reason);
    await this.deviceTokens!.deleteByUserAndPlatform(userId, 'apns-watch');
  }

  private async refreshDeviceSession(
    user: any,
    sid: string,
    presentedToken: string,
  ) {
    const session = await this.authSessions!.findById(sid);
    if (
      !session ||
      session.status !== 'active' ||
      !session.userId.equals(user._id)
    ) {
      throw new UnauthorizedException(AUTH_ERR_REVOKED);
    }
    const presentedHash = this.sha256(presentedToken);
    if (session.refreshTokenHash !== presentedHash) {
      throw new UnauthorizedException(AUTH_ERR_REVOKED);
    }
    const tokens = await this.signSessionTokens(user, sid);
    const rotated = await this.authSessions!.rotate(
      session._id,
      presentedHash,
      this.sha256(tokens.refreshToken),
    );
    if (!rotated) throw new UnauthorizedException(AUTH_ERR_REVOKED);
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;
    return { ...tokens, user: userObj };
  }

  async login(loginDto: LoginDto) {
    const { phoneNumber, email, password } = loginDto;

    let user;
    if (phoneNumber) {
      user = await this.usersService.findByPhoneNumber(phoneNumber);
    } else if (email) {
      user = await this.usersService.findByEmail(email);
    }

    if (!user || !user.password) {
      // If user registered with OTP only, they might not have a password
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateAuthResponse(user);
  }

  private async generateAuthResponse(user: any) {
    const payload = {
      sub: user._id.toString(),
      phoneNumber: user.phoneNumber,
      name: user.name,
    };

    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const refreshTokenExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '365d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: accessTokenExpiresIn as any,
      }),
      // 026 (F5): a refresh token must never work as a bearer access token.
      this.jwtService.signAsync(
        { ...payload, typ: 'refresh' },
        { expiresIn: refreshTokenExpiresIn as any },
      ),
    ]);

    await this.usersService.updateRefreshToken(
      user._id.toString(),
      refreshToken,
    );

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.refreshToken;

    return {
      accessToken,
      refreshToken,
      user: userObj,
    };
  }
}
