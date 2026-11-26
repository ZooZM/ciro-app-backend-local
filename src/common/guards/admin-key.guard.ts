import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guards operator-only routes via a static `x-admin-key` header: the reels
 * moderation endpoints (021 v4, FR-071), and since 026 the `/dev/*` simulator
 * routes (together with JwtAuthGuard + NonProductionGuard) and
 * `/admin/ledger/*`. Fails closed: an unset/empty `ADMIN_API_KEY` locks the
 * endpoint out for everyone rather than defaulting open.
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('ADMIN_API_KEY');
    if (!expected) {
      throw new UnauthorizedException('Admin API is not configured');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-admin-key'];
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}
