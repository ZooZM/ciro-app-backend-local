import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LinkCodesService } from './link-codes.service';

/** Live Redis at REDIS_URL, per-run key prefix (research R17). */
describe('LinkCodesService (026, R17) [live Redis]', () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const prefix = `unit:link:${randomBytes(6).toString('hex')}:`;
  let redis: Redis;
  let service: LinkCodesService;

  beforeAll(() => {
    redis = new Redis(url, { keyPrefix: prefix });
    service = new LinkCodesService(redis);
  });

  afterAll(async () => {
    const raw = new Redis(url);
    const keys = await raw.keys(`${prefix}*`);
    if (keys.length) await raw.del(...keys);
    raw.disconnect();
    redis.disconnect();
  });

  const errorCode = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as NotFoundException | ConflictException | null;
    return (e?.getResponse() as { error?: string } | undefined)?.error;
  };

  it('issues a 128-bit base64url code with EX 600', async () => {
    const { code, data } = await service.create('parent-1');
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(code, 'base64url')).toHaveLength(16);
    expect(data.state).toBe('issued');
    const ttl = await redis.ttl(LinkCodesService.key(code));
    expect(ttl).toBeGreaterThan(595);
    expect(ttl).toBeLessThanOrEqual(600);
    expect(
      await redis.ttl(LinkCodesService.currentKey('parent-1')),
    ).toBeGreaterThan(595);
  });

  it('a new code replaces the parent’s previous unused code', async () => {
    const a = await service.create('parent-2');
    const b = await service.create('parent-2');
    expect(a.code).not.toBe(b.code);
    expect(await service.get(a.code)).toBeNull();
    expect((await service.getCurrentForParent('parent-2'))?.code).toBe(b.code);
  });

  it('claim compare-and-set succeeds once; a second claim gets LINK_CODE_ALREADY_USED', async () => {
    const { code } = await service.create('parent-3');
    const claimed = await service.claim(code, 'child-1');
    expect(claimed).toMatchObject({ state: 'claimed', childUserId: 'child-1' });
    expect(await errorCode(service.claim(code, 'child-2'))).toBe(
      'LINK_CODE_ALREADY_USED',
    );
    expect((await service.get(code))?.childUserId).toBe('child-1');
  });

  it('only one of many concurrent claims wins', async () => {
    const { code } = await service.create('parent-4');
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => service.claim(code, `child-${i}`)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('keeps the TTL after a claim', async () => {
    const { code } = await service.create('parent-5');
    await service.claim(code, 'child-1');
    const ttl = await redis.ttl(LinkCodesService.key(code));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('an unknown or expired code gets LINK_CODE_INVALID_OR_EXPIRED', async () => {
    expect(await errorCode(service.claim('does-not-exist', 'child-1'))).toBe(
      'LINK_CODE_INVALID_OR_EXPIRED',
    );
    const { code } = await service.create('parent-6');
    await redis.del(LinkCodesService.key(code));
    expect(await errorCode(service.claim(code, 'child-1'))).toBe(
      'LINK_CODE_INVALID_OR_EXPIRED',
    );
    expect(await service.getCurrentForParent('parent-6')).toBeNull();
  });

  it('delete removes the code and the parent’s pointer', async () => {
    const { code } = await service.create('parent-7');
    await service.delete(code, 'parent-7');
    expect(await service.get(code)).toBeNull();
    expect(await service.getCurrentForParent('parent-7')).toBeNull();
  });
});
