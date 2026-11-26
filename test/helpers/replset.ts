import {
  INestApplication,
  ModuleMetadata,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { Test, TestingModule, TestingModuleBuilder } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { App } from 'supertest/types';
import { GlobalResponseInterceptor } from '../../src/common/interceptors/global-response.interceptor';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';

/**
 * 026 (T011): e2e bootstrap shared by the allowance suites.
 *
 * - MongoDB is a real single-node replica set (`MongoMemoryReplSet`), so ledger
 *   transactions run exactly as in production (research R2).
 * - Redis is the live instance at `REDIS_URL`. Every key this run writes is
 *   prefixed with `e2e:<runId>:` and deleted in `close()`.
 * - The Nest app gets the same global pipes, filters and interceptors as
 *   `src/main.ts`.
 */
export interface TestApp {
  app: INestApplication<App>;
  moduleRef: TestingModule;
  replSet: MongoMemoryReplSet;
  redis: Redis;
  runPrefix: string;
  close: () => Promise<void>;
}

export interface BootOptions extends Pick<
  ModuleMetadata,
  'imports' | 'providers' | 'controllers'
> {
  /** Extra env, set before the modules are compiled. */
  env?: Record<string, string>;
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export const TEST_JWT_SECRET = 'e2e-secret';
export const TEST_ADMIN_KEY = 'e2e-admin-key';

export async function startReplSet(): Promise<MongoMemoryReplSet> {
  return MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
}

export async function bootTestApp(options: BootOptions): Promise<TestApp> {
  const replSet = await startReplSet();
  const runPrefix = `e2e:${randomBytes(6).toString('hex')}:`;
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  Object.assign(process.env, {
    JWT_SECRET: TEST_JWT_SECRET,
    ADMIN_API_KEY: TEST_ADMIN_KEY,
    REDIS_URL: redisUrl,
    ...options.env,
  });

  const redis = new Redis(redisUrl, { keyPrefix: runPrefix });

  let builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      MongooseModule.forRoot(replSet.getUri()),
      BullModule.forRoot({
        connection: { url: redisUrl, maxRetriesPerRequest: null },
        prefix: `${runPrefix}bull`,
      }),
      ...(options.imports ?? []),
    ],
    providers: options.providers ?? [],
    controllers: options.controllers ?? [],
  })
    .overrideProvider('REDIS_CLIENT')
    .useValue(redis);

  if (options.override) builder = options.override(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new GlobalResponseInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();
  // Listen once on an ephemeral port: supertest otherwise starts and stops a
  // listener per call, which resets connections when requests run concurrently.
  await app.listen(0);

  const close = async () => {
    await app.close();
    await flushPrefix(redisUrl, runPrefix);
    redis.disconnect();
    await replSet.stop();
  };

  return { app, moduleRef, replSet, redis, runPrefix, close };
}

/** Deletes every Redis key that starts with `prefix` (keyPrefix is not applied to SCAN). */
export async function flushPrefix(
  redisUrl: string,
  prefix: string,
): Promise<void> {
  const raw = new Redis(redisUrl);
  try {
    let cursor = '0';
    do {
      const [next, keys] = await raw.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        500,
      );
      cursor = next;
      if (keys.length > 0) await raw.del(...keys);
    } while (cursor !== '0');
  } finally {
    raw.disconnect();
  }
}
