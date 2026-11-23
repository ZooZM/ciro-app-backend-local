import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import {
  RESERVE_MISS,
  RESERVE_OVER_LIMIT,
  SpendCounterService,
} from './spend-counter.service';
import type { CardTransactionsRepository } from './repositories/card-transactions.repository';

/**
 * Runs against the live Redis at REDIS_URL (research R3), with a per-run key
 * prefix that is deleted afterwards.
 */
describe('SpendCounterService (026, R3) [live Redis]', () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const prefix = `unit:spend:${randomBytes(6).toString('hex')}:`;
  let redis: Redis;
  let txns: {
    sumApprovedOn: jest.Mock;
    sumSameDayReturnsOn: jest.Mock;
    distinctChildrenOn: jest.Mock;
  };
  let service: SpendCounterService;
  const date = '2026-11-18';

  beforeAll(() => {
    redis = new Redis(url, { keyPrefix: prefix, lazyConnect: false });
  });

  beforeEach(() => {
    txns = {
      sumApprovedOn: jest.fn().mockResolvedValue(0),
      sumSameDayReturnsOn: jest.fn().mockResolvedValue(0),
      distinctChildrenOn: jest.fn().mockResolvedValue([]),
    };
    service = new SpendCounterService(
      redis,
      txns as unknown as CardTransactionsRepository,
    );
  });

  afterAll(async () => {
    const raw = new Redis(url);
    const keys = await raw.keys(`${prefix}*`);
    if (keys.length) await raw.del(...keys);
    raw.disconnect();
    redis.disconnect();
  });

  const child = () => new Types.ObjectId().toString();

  it('a miss returns -1', async () => {
    expect(await service.reserve(child(), date, 100, 5000)).toBe(RESERVE_MISS);
  });

  it('concurrent reserves never exceed the limit', async () => {
    const c = child();
    await service.rebuild(c, date);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.reserve(c, date, 3000, 4000)),
    );
    expect(results.filter((r) => r > 0)).toHaveLength(1);
    expect(results.filter((r) => r === RESERVE_OVER_LIMIT)).toHaveLength(19);
    expect(await service.get(c, date)).toBe(3000);
  });

  it('an exact-limit reservation succeeds; one halala more does not', async () => {
    const c = child();
    await service.rebuild(c, date);
    expect(await service.reserve(c, date, 5000, 5000)).toBe(5000);
    expect(await service.reserve(c, date, 1, 5000)).toBe(RESERVE_OVER_LIMIT);
  });

  it('rebuild uses approved purchases minus same-day returns, and SET NX keeps an existing value', async () => {
    const c = child();
    txns.sumApprovedOn.mockResolvedValue(4500);
    txns.sumSameDayReturnsOn.mockResolvedValue(1000);
    expect(await service.rebuild(c, date)).toBe(3500);
    txns.sumApprovedOn.mockResolvedValue(9999);
    expect(await service.rebuild(c, date)).toBe(3500);
    expect(await redis.ttl(SpendCounterService.key(c, date))).toBeGreaterThan(
      172_000,
    );
  });

  it('releasing twice for the same transaction decrements once', async () => {
    const c = child();
    await service.rebuild(c, date);
    await service.reserve(c, date, 3000, 5000);
    const txn = new Types.ObjectId().toString();
    expect(await service.release(c, date, 3000, txn)).toBe(true);
    expect(await service.release(c, date, 3000, txn)).toBe(false);
    expect(await service.get(c, date)).toBe(0);
  });

  it('the counter never drops below 0', async () => {
    const c = child();
    await service.rebuild(c, date);
    await service.reserve(c, date, 1000, 5000);
    await service.release(c, date, 2500, new Types.ObjectId().toString());
    expect(await service.get(c, date)).toBe(0);
  });

  it('get rebuilds on a miss', async () => {
    const c = child();
    txns.sumApprovedOn.mockResolvedValue(1200);
    expect(await service.get(c, date)).toBe(1200);
  });

  it('reconcileDay rewrites a drifted counter', async () => {
    const c = child();
    await service.rebuild(c, date);
    await service.reserve(c, date, 2000, 5000);
    txns.distinctChildrenOn.mockResolvedValue([new Types.ObjectId(c)]);
    txns.sumApprovedOn.mockResolvedValue(500);
    const rewrites = await service.reconcileDay(date);
    expect(rewrites).toEqual([
      { childUserId: c, riyadhDate: date, from: 2000, to: 500 },
    ]);
    expect(await service.get(c, date)).toBe(500);
  });
});
