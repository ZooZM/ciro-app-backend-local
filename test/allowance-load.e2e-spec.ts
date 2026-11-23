import { randomUUID } from 'crypto';
import { getModelToken } from '@nestjs/mongoose';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { OpsAlertModule } from '../src/common/ops-alert/ops-alert.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RedisModule } from '../src/modules/redis/redis.module';
import { WalletModule } from '../src/modules/wallet/wallet.module';
import { FamilyCoreModule } from '../src/modules/family-core/family-core.module';
import { CardsModule } from '../src/modules/cards/cards.module';
import { FamilyModule } from '../src/modules/family/family.module';
import { AllowanceModule } from '../src/modules/allowance/allowance.module';
import { ChatGateway } from '../src/modules/chat/chat.gateway';
import { PushService } from '../src/modules/notifications/push.service';
import { CardEventsService } from '../src/modules/cards/card-events.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { ReconciliationService } from '../src/modules/wallet/reconciliation.service';
import { SpendCounterService } from '../src/modules/family-core/spend-counter.service';
import {
  Card,
  CardDocument,
} from '../src/modules/family-core/schemas/card.schema';
import {
  CardTransaction,
  CardTransactionDocument,
} from '../src/modules/family-core/schemas/card-transaction.schema';
import { SPENDING_CATEGORIES } from '../src/modules/family-core/family-core.constants';
import { EntryType } from '../src/modules/wallet/schemas/ledger-entry.schema';
import { riyadhDate } from '../src/common/utils/riyadh-time.util';
import { bootTestApp, TestApp } from './helpers/replset';
import { createUser, TestUser } from './helpers/users';

/**
 * 026 (T239, SC-004): 1,000 simulated purchases with random amounts and
 * categories, including 100 pairs sent at the same moment. No approval may
 * exceed a limit or the balance, spent today may never exceed the effective
 * limit, and reconciliation must report `ok` afterwards.
 *
 * The server-side authorization time (p50/p95) is read from the `decisionMs`
 * recorded on each row and printed. Timings against `MongoMemoryReplSet` are
 * indicative only (plan Performance Goals: p95 ≤ 300 ms).
 */
describe('Allowance load (SC-004, e2e)', () => {
  const CHILDREN = 20;
  /** Purchases in flight across different children at once (the shared settlement account is the contention point). */
  const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY) || 20;
  /**
   * Even kids are balance-limited (20.00 SAR... of 500.00/day), odd kids are
   * limit-limited (600.00 balance, 250.00/day) so both INSUFFICIENT_BALANCE and
   * OVER_DAILY_LIMIT get exercised.
   */
  const limitsFor = (index: number) =>
    index % 2 === 0
      ? { balance: 20_000, daily: 50_000 }
      : { balance: 60_000, daily: 25_000 };
  const PER_PURCHASE = 2_500;
  const BLOCKED = ['gaming', 'online'];
  const TOTAL_SEQUENTIAL = 800;
  const PAIRS = 100;

  let t: TestApp;
  let wallet: WalletService;
  let events: CardEventsService;
  let txns: Model<CardTransactionDocument>;
  let cards: Model<CardDocument>;

  beforeAll(async () => {
    t = await bootTestApp({
      imports: [
        OpsAlertModule,
        RedisModule,
        AuthModule,
        WalletModule,
        FamilyCoreModule,
        CardsModule,
        FamilyModule,
        AllowanceModule,
      ],
      override: (b) =>
        b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    });
    wallet = t.app.get(WalletService);
    events = t.app.get(CardEventsService);
    txns = t.app.get(getModelToken(CardTransaction.name));
    cards = t.app.get(getModelToken(Card.name));
    jest
      .spyOn(t.app.get(ChatGateway), 'emitToUser')
      .mockImplementation(() => undefined);
    jest
      .spyOn(t.app.get(PushService), 'sendToUser')
      .mockResolvedValue(undefined);
  }, 180_000);

  afterAll(async () => {
    await t?.close();
  });

  interface Kid {
    balance: number;
    daily: number;
    user: TestUser;
    parent: TestUser;
    cardRef: string;
    accountId: Types.ObjectId;
  }

  async function makeKid(index: number): Promise<Kid> {
    const { balance: BALANCE, daily: DAILY } = limitsFor(index);
    const http = t.app.getHttpServer();
    const parent = await createUser(t.app, 'Mama');
    const user = await createUser(t.app, 'Kid');
    const { code } = (
      await request(http)
        .post('/family/link-codes')
        .set(parent.auth)
        .expect(200)
    ).body.data;
    await request(http)
      .post('/family/link-codes/claim')
      .set(user.auth)
      .send({ code })
      .expect(200);
    await request(http)
      .post('/family/link-codes/current/confirm')
      .set(parent.auth)
      .expect(200);
    await request(http)
      .put(`/allowance/children/${user.id}/settings`)
      .set(parent.auth)
      .send({
        monthlyAmountHalalas: 0,
        payoutDay: 15,
        dailyLimitHalalas: DAILY,
        perPurchaseMaxHalalas: PER_PURCHASE,
        blockedCategories: BLOCKED,
        purchaseNotifications: false,
      })
      .expect(200);
    const account = (await wallet.findChildAccount(user.id))!;
    const from = await wallet.getSystemAccount('simulation_funding');
    await wallet.runInTransaction((s) =>
      wallet.transfer(
        {
          type: EntryType.SIMULATED_FUNDING,
          fromAccountId: from,
          toAccountId: account._id,
          amountHalalas: BALANCE,
          idempotencyKey: `seed:${randomUUID()}`,
          initiator: { kind: 'simulation' },
        },
        s,
      ),
    );
    const card = (await cards.findOne({
      childUserId: new Types.ObjectId(user.id),
    }))!;
    return {
      balance: BALANCE,
      daily: DAILY,
      user,
      parent,
      cardRef: card.cardRef,
      accountId: account._id,
    };
  }

  // Deterministic pseudo-random so a failure is reproducible.
  let seed = 20261118;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };

  const purchase = (kid: Kid) =>
    events.handle(
      {
        kind: 'authorization_request',
        issuerTxnId: `load_${randomUUID()}`,
        cardRef: kid.cardRef,
        amountHalalas: 50 + rand(PER_PURCHASE + 600), // some exceed the per-purchase maximum
        merchantName: 'Load Test Merchant',
        category: SPENDING_CATEGORIES[rand(SPENDING_CATEGORIES.length)],
        occurredAt: new Date(),
      },
      'simulation',
    );

  it('1,000 purchases incl. 100 concurrent pairs: no limit or balance is ever breached, and the ledger reconciles', async () => {
    const kids: Kid[] = [];
    for (let i = 0; i < CHILDREN; i++) kids.push(await makeKid(i));

    const started = Date.now();
    // 800 across different children at once, in waves of CONCURRENCY purchases.
    for (let w = 0; w < TOTAL_SEQUENTIAL / CONCURRENCY; w++) {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, j) =>
          purchase(kids[(w * CONCURRENCY + j) % CHILDREN]),
        ),
      );
    }
    // 100 pairs: two purchases for the same child at the same moment.
    for (let p = 0; p < PAIRS; p++) {
      const kid = kids[rand(CHILDREN)];
      await Promise.all([purchase(kid), purchase(kid)]);
    }
    const elapsedMs = Date.now() - started;

    const today = riyadhDate(new Date());
    const all = await txns.find({ kind: 'authorization' }).lean();
    expect(all.length).toBe(TOTAL_SEQUENTIAL + PAIRS * 2);

    const unavailable = all.filter(
      (x) => x.declineReason === 'SERVICE_UNAVAILABLE',
    );
    expect(unavailable).toHaveLength(0);

    let approvedCount = 0;
    const declinesByReason: Record<string, number> = {};
    for (const kid of kids) {
      const mine = all.filter((x) => x.childUserId.toString() === kid.user.id);
      const approved = mine.filter((x) => x.outcome === 'approved');
      approvedCount += approved.length;
      for (const d of mine.filter((x) => x.outcome === 'declined')) {
        declinesByReason[d.declineReason ?? '?'] =
          (declinesByReason[d.declineReason ?? '?'] ?? 0) + 1;
      }

      // No approval breaks a rule.
      for (const x of approved) {
        expect(x.amountHalalas).toBeLessThanOrEqual(PER_PURCHASE);
        expect(BLOCKED).not.toContain(x.category);
        expect(['gambling', 'alcohol_tobacco', 'adult']).not.toContain(
          x.category,
        );
      }

      // Spent today never exceeds the effective limit, and never goes below what was really approved.
      const spent = approved.reduce((sum, x) => sum + x.amountHalalas, 0);
      expect(spent).toBeLessThanOrEqual(kid.daily);
      expect(await t.app.get(SpendCounterService).get(kid.user.id, today)).toBe(
        spent,
      );

      // The balance matches the committed movements and never goes below zero.
      const balance = await wallet.getBalance(kid.accountId);
      expect(balance).toBe(kid.balance - spent);
      expect(balance).toBeGreaterThanOrEqual(0);

      // Every approval has exactly one ledger entry; no decline has one.
      for (const x of mine) {
        if (x.outcome === 'approved') expect(x.ledgerEntryId).toBeDefined();
        else expect(x.ledgerEntryId).toBeUndefined();
      }
    }

    // The mix actually exercised the rules.
    expect(approvedCount).toBeGreaterThan(200);
    expect(Object.keys(declinesByReason).length).toBeGreaterThanOrEqual(4);
    expect(declinesByReason.OVER_DAILY_LIMIT).toBeGreaterThan(0);
    expect(declinesByReason.INSUFFICIENT_BALANCE).toBeGreaterThan(0);

    // FR-022 / SC-005: the books balance after the run.
    const report = await t.app.get(ReconciliationService).run();
    expect(report.status).toBe('ok');
    expect(report.mismatches).toHaveLength(0);

    // Server-side authorization time, from the rows themselves.
    const times = all
      .map((x) => x.decisionMs ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const pct = (p: number) =>
      times[Math.min(times.length - 1, Math.floor(times.length * p))];
    const p50 = pct(0.5);
    const p95 = pct(0.95);

    console.info(
      `[SC-004] concurrency=${CONCURRENCY}: ${all.length} authorizations in ${elapsedMs} ms (${approvedCount} approved; declines ${JSON.stringify(declinesByReason)}); ` +
        `server-side decision time p50=${p50} ms p95=${p95} ms max=${times[times.length - 1]} ms ` +
        `(MongoMemoryReplSet: indicative only; target p95 ≤ 300 ms${p95 > 300 ? ' — EXCEEDED, flag for review' : ''})`,
    );
    expect(times.length).toBeGreaterThan(0);
  }, 900_000);
});
