import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { Types } from 'mongoose';
import { CardTransactionsRepository } from './repositories/card-transactions.repository';
import { TWO_DAYS_SECONDS } from './family-core.constants';

/** research R3: atomic check-and-increment; -1 = miss, -2 = over the limit. */
const RESERVE_LUA = `
local cur = redis.call('GET', KEYS[1])
if not cur then return -1 end
if tonumber(cur) + tonumber(ARGV[1]) > tonumber(ARGV[2]) then return -2 end
return redis.call('INCRBY', KEYS[1], ARGV[1])
`;

/** Decrement floored at 0; a missing key stays missing (it is rebuilt from the records). */
const RELEASE_LUA = `
local cur = redis.call('GET', KEYS[1])
if not cur then return -1 end
local next = tonumber(cur) - tonumber(ARGV[1])
if next < 0 then next = 0 end
redis.call('SET', KEYS[1], next, 'KEEPTTL')
return next
`;

export const RESERVE_MISS = -1;
export const RESERVE_OVER_LIMIT = -2;

/**
 * 026 (research R3): spent-today per child per Riyadh date in Redis.
 * The counter is a cache of approved purchases minus same-day refunds and
 * reversals of same-day purchases, rebuilt from `card_transactions` on a miss.
 */
@Injectable()
export class SpendCounterService {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly cardTransactions: CardTransactionsRepository,
  ) {}

  static key(childUserId: string, riyadhDate: string): string {
    return `allowance:spent:${childUserId}:${riyadhDate}`;
  }

  async reserve(
    childUserId: string,
    riyadhDate: string,
    amountHalalas: number,
    effectiveLimitHalalas: number,
  ): Promise<number> {
    const result = await this.redis.eval(
      RESERVE_LUA,
      1,
      SpendCounterService.key(childUserId, riyadhDate),
      amountHalalas,
      effectiveLimitHalalas,
    );
    return Number(result);
  }

  async compute(childUserId: string, riyadhDate: string): Promise<number> {
    const child = new Types.ObjectId(childUserId);
    const [approved, returned] = await Promise.all([
      this.cardTransactions.sumApprovedOn(child, riyadhDate),
      this.cardTransactions.sumSameDayReturnsOn(child, riyadhDate),
    ]);
    return Math.max(0, approved - returned);
  }

  /** Rebuilds the counter if it is missing (`SET NX`) and returns the stored value. */
  async rebuild(childUserId: string, riyadhDate: string): Promise<number> {
    const key = SpendCounterService.key(childUserId, riyadhDate);
    const value = await this.compute(childUserId, riyadhDate);
    await this.redis.set(key, value, 'EX', TWO_DAYS_SECONDS, 'NX');
    return Number((await this.redis.get(key)) ?? value);
  }

  /**
   * Gives back a reservation or a same-day refund. Idempotent per card
   * transaction: a second call for the same id does nothing.
   */
  async release(
    childUserId: string,
    riyadhDate: string,
    amountHalalas: number,
    cardTransactionId: string,
  ): Promise<boolean> {
    const marker = await this.redis.set(
      `allowance:comp:${cardTransactionId}`,
      1,
      'EX',
      TWO_DAYS_SECONDS,
      'NX',
    );
    if (marker !== 'OK') return false;
    await this.redis.eval(
      RELEASE_LUA,
      1,
      SpendCounterService.key(childUserId, riyadhDate),
      amountHalalas,
    );
    return true;
  }

  async get(childUserId: string, riyadhDate: string): Promise<number> {
    const raw = await this.redis.get(
      SpendCounterService.key(childUserId, riyadhDate),
    );
    if (raw !== null) return Number(raw);
    return this.rebuild(childUserId, riyadhDate);
  }

  /**
   * Nightly check (R15): rewrites counters that drifted from the records for
   * `riyadhDate`. Returns the rewrites for the reconciliation report.
   */
  async reconcileDay(
    riyadhDate: string,
  ): Promise<
    { childUserId: string; riyadhDate: string; from: number; to: number }[]
  > {
    const rewrites: {
      childUserId: string;
      riyadhDate: string;
      from: number;
      to: number;
    }[] = [];
    const children = await this.cardTransactions.distinctChildrenOn(riyadhDate);
    for (const childId of children) {
      const id = childId.toString();
      const key = SpendCounterService.key(id, riyadhDate);
      const raw = await this.redis.get(key);
      if (raw === null) continue;
      const expected = await this.compute(id, riyadhDate);
      if (Number(raw) !== expected) {
        await this.redis.set(key, expected, 'KEEPTTL');
        rewrites.push({
          childUserId: id,
          riyadhDate,
          from: Number(raw),
          to: expected,
        });
      }
    }
    return rewrites;
  }
}
