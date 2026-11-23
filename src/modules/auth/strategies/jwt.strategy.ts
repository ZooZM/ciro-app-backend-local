import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionsRepository } from '../auth-sessions.repository';

export interface JwtPayload {
  sub: string;
  phoneNumber: string;
  /** 026 (F5): set on refresh tokens, which must never be accepted as bearer tokens. */
  typ?: string;
  /** 026: device session id (watch). */
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    // Optional: some test setups build the strategy with only a ConfigService.
    @Optional() private authSessions?: AuthSessionsRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || payload.typ === 'refresh') {
      throw new UnauthorizedException();
    }
    // A watch token dies the moment its session is revoked, not 15 minutes later.
    if (
      payload.sid &&
      this.authSessions &&
      !(await this.authSessions.isActive(payload.sid))
    ) {
      throw new UnauthorizedException();
    }
    return { userId: payload.sub, phoneNumber: payload.phoneNumber };
  }
}
