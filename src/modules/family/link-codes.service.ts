import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import {
  linkCodeAlreadyUsed,
  linkCodeInvalidOrExpired,
} from '../family-core/allowance-errors';

export const LINK_CODE_TTL_SECONDS = 600;

export interface LinkCodeData {
  parentUserId: string;
  state: 'issued' | 'claimed';
  createdAt: string;
  expiresAt: string;
  childUserId?: string;
  claimedAt?: string;
}

/**
 * Compare-and-set `issued → claimed` that keeps the TTL (research R17), so a
 * code can be claimed exactly once and never lives longer than 10 minutes.
 * Returns: nil (no such code), 'USED', or the new JSON.
 */
const CLAIM_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local data = cjson.decode(raw)
if data.state ~= 'issued' then return 'USED' end
data.state = 'claimed'
data.childUserId = ARGV[1]
data.claimedAt = ARGV[2]
local out = cjson.encode(data)
redis.call('SET', KEYS[1], out, 'KEEPTTL')
return out
`;

/**
 * 026 (FR-001, research R17): one-time QR link codes in Redis.
 * `family:link:{code}` holds the state; `family:link:current:{parentUserId}`
 * points at that parent's unused code so a new code replaces the old one.
 */
@Injectable()
export class LinkCodesService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  static key(code: string): string {
    return `family:link:${code}`;
  }

  static currentKey(parentUserId: string): string {
    return `family:link:current:${parentUserId}`;
  }

  async create(
    parentUserId: string,
  ): Promise<{ code: string; data: LinkCodeData }> {
    const previous = await this.redis.get(
      LinkCodesService.currentKey(parentUserId),
    );
    if (previous) await this.redis.del(LinkCodesService.key(previous));

    const code = randomBytes(16).toString('base64url');
    const now = new Date();
    const data: LinkCodeData = {
      parentUserId,
      state: 'issued',
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + LINK_CODE_TTL_SECONDS * 1000,
      ).toISOString(),
    };
    await this.redis
      .multi()
      .set(
        LinkCodesService.key(code),
        JSON.stringify(data),
        'EX',
        LINK_CODE_TTL_SECONDS,
      )
      .set(
        LinkCodesService.currentKey(parentUserId),
        code,
        'EX',
        LINK_CODE_TTL_SECONDS,
      )
      .exec();
    return { code, data };
  }

  async get(code: string): Promise<LinkCodeData | null> {
    const raw = await this.redis.get(LinkCodesService.key(code));
    return raw ? (JSON.parse(raw) as LinkCodeData) : null;
  }

  async getCurrentForParent(
    parentUserId: string,
  ): Promise<{ code: string; data: LinkCodeData } | null> {
    const code = await this.redis.get(
      LinkCodesService.currentKey(parentUserId),
    );
    if (!code) return null;
    const data = await this.get(code);
    return data ? { code, data } : null;
  }

  /** Claims `code` for `childUserId`; throws the contract errors. */
  async claim(
    code: string,
    childUserId: string,
    now = new Date(),
  ): Promise<LinkCodeData> {
    const result = await this.redis.eval(
      CLAIM_LUA,
      1,
      LinkCodesService.key(code),
      childUserId,
      now.toISOString(),
    );
    if (!result) throw linkCodeInvalidOrExpired();
    if (result === 'USED') throw linkCodeAlreadyUsed();
    return JSON.parse(result as string) as LinkCodeData;
  }

  async delete(code: string, parentUserId?: string): Promise<void> {
    const keys = [LinkCodesService.key(code)];
    if (parentUserId) {
      const current = await this.redis.get(
        LinkCodesService.currentKey(parentUserId),
      );
      if (current === code)
        keys.push(LinkCodesService.currentKey(parentUserId));
    }
    await this.redis.del(...keys);
  }

  async deleteCurrentForParent(parentUserId: string): Promise<void> {
    const code = await this.redis.get(
      LinkCodesService.currentKey(parentUserId),
    );
    const keys = [LinkCodesService.currentKey(parentUserId)];
    if (code) keys.push(LinkCodesService.key(code));
    await this.redis.del(...keys);
  }
}
