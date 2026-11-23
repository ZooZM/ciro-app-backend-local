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
import { CardsDevModule } from '../src/modules/cards/dev/cards-dev.module';
import { FamilyModule } from '../src/modules/family/family.module';
import { AllowanceModule } from '../src/modules/allowance/allowance.module';
import { ChatGateway } from '../src/modules/chat/chat.gateway';
import { PushService } from '../src/modules/notifications/push.service';
import { CardEventsService } from '../src/modules/cards/card-events.service';
import { LedgerHealthService } from '../src/modules/wallet/ledger-health.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { DailyLimitBoostsRepository } from '../src/modules/family-core/repositories/daily-limit-boosts.repository';
import { LedgerEntriesRepository } from '../src/modules/wallet/repositories/ledger-entries.repository';
import { SpendCounterService } from '../src/modules/family-core/spend-counter.service';
import {
  Card,
  CardDocument,
} from '../src/modules/family-core/schemas/card.schema';
import {
  CardTransaction,
  CardTransactionDocument,
} from '../src/modules/family-core/schemas/card-transaction.schema';
import { EntryType } from '../src/modules/wallet/schemas/ledger-entry.schema';
import { riyadhDate } from '../src/common/utils/riyadh-time.util';
import { bootTestApp, TEST_ADMIN_KEY, TestApp } from './helpers/replset';
import { createUser, TestUser } from './helpers/users';

/**
 * 026 (T119, US2, FR-040–045, SC-004): purchase rules, concurrency and
 * refunds through the dev simulator, against a real replica set and live Redis.
 */
describe('Card events (e2e)', () => {
  let t: TestApp;
  let wallet: WalletService;
  let events: CardEventsService;
  let cardModel: Model<CardDocument>;
  let txnModel: Model<CardTransactionDocument>;
  let pushSpy: jest.SpyInstance;
  const http = () => t.app.getHttpServer();

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
        CardsDevModule,
      ],
      override: (b) =>
        b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    });
    wallet = t.app.get(WalletService);
    events = t.app.get(CardEventsService);
    cardModel = t.app.get(getModelToken(Card.name));
    txnModel = t.app.get(getModelToken(CardTransaction.name));
    jest
      .spyOn(t.app.get(ChatGateway), 'emitToUser')
      .mockImplementation(() => undefined);
    pushSpy = jest
      .spyOn(t.app.get(PushService), 'sendToUser')
      .mockResolvedValue(undefined);
  }, 180_000);

  afterAll(async () => {
    await t?.close();
  });

  interface Family {
    parent: TestUser;
    child: TestUser;
    accountId: Types.ObjectId;
  }

  /** A linked child with the given limits and balance (seeded straight into the ledger). */
  async function family(opts: {
    balance: number;
    daily?: number;
    perPurchase?: number;
    blocked?: string[];
  }): Promise<Family> {
    const parent = await createUser(t.app, 'Mama');
    const child = await createUser(t.app, 'Sara');
    const { code } = (
      await request(http())
        .post('/family/link-codes')
        .set(parent.auth)
        .expect(200)
    ).body.data;
    await request(http())
      .post('/family/link-codes/claim')
      .set(child.auth)
      .send({ code })
      .expect(200);
    await request(http())
      .post('/family/link-codes/current/confirm')
      .set(parent.auth)
      .expect(200);
    await request(http())
      .put(`/allowance/children/${child.id}/settings`)
      .set(parent.auth)
      .send({
        monthlyAmountHalalas: 0,
        payoutDay: 15,
        dailyLimitHalalas: opts.daily ?? 5000,
        perPurchaseMaxHalalas: opts.perPurchase ?? 3000,
        blockedCategories: opts.blocked ?? [],
        purchaseNotifications: true,
      })
      .expect(200);
    const account = (await wallet.findChildAccount(child.id))!;
    await fund(account._id, opts.balance);
    return { parent, child, accountId: account._id };
  }

  async function fund(accountId: Types.ObjectId, amount: number) {
    if (amount <= 0) return;
    const from = await wallet.getSystemAccount('simulation_funding');
    await wallet.runInTransaction((s) =>
      wallet.transfer(
        {
          type: EntryType.SIMULATED_FUNDING,
          fromAccountId: from,
          toAccountId: accountId,
          amountHalalas: amount,
          idempotencyKey: `seed:${randomUUID()}`,
          initiator: { kind: 'simulation' },
        },
        s,
      ),
    );
  }

  const adminPost = (path: string, user: TestUser) =>
    request(http())
      .post(path)
      .set(user.auth)
      .set('x-admin-key', TEST_ADMIN_KEY);

  const purchase = (
    f: Family,
    amount: number,
    category = 'food_dining',
    merchant = 'School canteen',
  ) =>
    adminPost('/dev/cards/simulate/purchase', f.child).send({
      merchantName: merchant,
      category,
      amountHalalas: amount,
    });

  const refund = (f: Family, originalTransactionId: string, amount: number) =>
    adminPost('/dev/cards/simulate/refund', f.child).send({
      originalTransactionId,
      amountHalalas: amount,
    });

  const summary = async (f: Family) =>
    (
      await request(http())
        .get('/allowance/me/summary')
        .set(f.child.auth)
        .expect(200)
    ).body.data;

  // ───────────────────────── US2 acceptance scenarios ─────────────────────────

  it('US2-1/2: approves 25.00, then declines 30.00 as over the daily limit with nothing changed', async () => {
    const f = await family({ balance: 20000, daily: 5000, perPurchase: 3000 });
    const first = (await purchase(f, 2500).expect(200)).body.data;
    expect(first).toMatchObject({ outcome: 'approved', declineReason: null });
    expect(first.summary).toMatchObject({
      balanceHalalas: 17500,
      spentTodayHalalas: 2500,
      availableTodayHalalas: 2500,
    });

    const second = (await purchase(f, 3000).expect(200)).body.data;
    expect(second).toMatchObject({
      outcome: 'declined',
      declineReason: 'OVER_DAILY_LIMIT',
    });
    expect(second.summary).toMatchObject({
      balanceHalalas: 17500,
      spentTodayHalalas: 2500,
    });
  }, 60_000);

  it('US2-3: 30.01 against a 30.00 per-purchase maximum is declined', async () => {
    const f = await family({ balance: 20000, daily: 5000, perPurchase: 3000 });
    const res = (await purchase(f, 3001).expect(200)).body.data;
    expect(res).toMatchObject({
      outcome: 'declined',
      declineReason: 'OVER_PER_PURCHASE_LIMIT',
    });
    expect(res.summary.balanceHalalas).toBe(20000);
  }, 60_000);

  it('US2-4: a paused card declines everything', async () => {
    const f = await family({ balance: 20000 });
    await cardModel.updateOne(
      { childUserId: new Types.ObjectId(f.child.id) },
      { $set: { status: 'paused' } },
    );
    const res = (await purchase(f, 500).expect(200)).body.data;
    expect(res).toMatchObject({
      outcome: 'declined',
      declineReason: 'CARD_PAUSED',
    });
  }, 60_000);

  it('US2-5: blocked and always-blocked categories are declined', async () => {
    const f = await family({ balance: 20000, blocked: ['gaming'] });
    expect(
      (await purchase(f, 500, 'gaming').expect(200)).body.data,
    ).toMatchObject({
      outcome: 'declined',
      declineReason: 'BLOCKED_CATEGORY',
    });
    for (const category of ['gambling', 'alcohol_tobacco', 'adult']) {
      expect(
        (await purchase(f, 500, category).expect(200)).body.data,
      ).toMatchObject({
        outcome: 'declined',
        declineReason: 'BLOCKED_CATEGORY',
      });
    }
    expect(
      (await purchase(f, 500, 'groceries').expect(200)).body.data.outcome,
    ).toBe('approved');
  }, 60_000);

  it('US2-6: 10.01 against a 10.00 balance is declined as insufficient balance', async () => {
    const f = await family({ balance: 1000, daily: 5000, perPurchase: 5000 });
    const res = (await purchase(f, 1001).expect(200)).body.data;
    expect(res).toMatchObject({
      outcome: 'declined',
      declineReason: 'INSUFFICIENT_BALANCE',
    });
    expect(res.summary).toMatchObject({
      balanceHalalas: 1000,
      availableTodayHalalas: 1000,
    });
  }, 60_000);

  it('a purchase exactly equal to the available amount is approved; one halala more is declined', async () => {
    const f = await family({ balance: 3000, daily: 3000, perPurchase: 3000 });
    expect((await purchase(f, 3001).expect(200)).body.data.outcome).toBe(
      'declined',
    );
    expect((await purchase(f, 3000).expect(200)).body.data.outcome).toBe(
      'approved',
    );
    expect(await summary(f)).toMatchObject({
      balanceHalalas: 0,
      availableTodayHalalas: 0,
    });
  }, 60_000);

  it('US2-7: two 30.00 purchases at the same moment with 40.00 available → exactly one approved', async () => {
    // Repeated on five children at once to give the race many chances.
    const families = await Promise.all(
      Array.from({ length: 5 }, () =>
        family({ balance: 10000, daily: 4000, perPurchase: 3000 }),
      ),
    );
    const results = await Promise.all(
      families.flatMap((f) => [purchase(f, 3000), purchase(f, 3000)]),
    );
    families.forEach((f, i) => {
      const pair = [results[i * 2].body.data, results[i * 2 + 1].body.data];
      expect(pair.filter((r) => r.outcome === 'approved')).toHaveLength(1);
      expect(pair.filter((r) => r.outcome === 'declined')).toHaveLength(1);
      expect(pair.find((r) => r.outcome === 'declined').declineReason).toBe(
        'OVER_DAILY_LIMIT',
      );
    });
    for (const f of families) {
      expect(await summary(f)).toMatchObject({
        spentTodayHalalas: 3000,
        balanceHalalas: 7000,
      });
    }
  }, 120_000);

  it('many simultaneous purchases never exceed the daily limit or the balance', async () => {
    const f = await family({ balance: 5000, daily: 4000, perPurchase: 1000 });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => purchase(f, 900)),
    );
    const approved = results.filter(
      (r) => r.body.data.outcome === 'approved',
    ).length;
    expect(approved).toBe(4); // 4 × 900 = 3600; a fifth would reach 4500 > 4000
    const s = await summary(f);
    expect(s.spentTodayHalalas).toBe(3600);
    expect(s.balanceHalalas).toBe(1400);
    expect(s.spentTodayHalalas).toBeLessThanOrEqual(
      s.effectiveDailyLimitHalalas,
    );
  }, 120_000);

  describe('concurrency with other money movements (FR-042)', () => {
    it('a pull-back and a purchase that together exceed the balance → exactly one succeeds, never below 0.00', async () => {
      for (let round = 0; round < 4; round++) {
        const f = await family({
          balance: 4000,
          daily: 5000,
          perPurchase: 3000,
        });
        const parentWallet = await wallet.getOrCreateUserWallet(f.parent.id);
        const pullBack = wallet
          .runInTransaction((s) =>
            wallet.transfer(
              {
                type: EntryType.PULL_BACK,
                fromAccountId: f.accountId,
                toAccountId: parentWallet._id,
                amountHalalas: 3000,
                idempotencyKey: `pullback:${randomUUID()}`,
                initiator: {
                  kind: 'parent',
                  userId: new Types.ObjectId(f.parent.id),
                },
              },
              s,
            ),
          )
          .then(
            () => 'ok',
            () => 'rejected',
          );
        const [pulled, bought] = await Promise.all([
          pullBack,
          purchase(f, 3000),
        ]);
        const purchaseOk = bought.body.data.outcome === 'approved';
        expect([pulled === 'ok', purchaseOk].filter(Boolean)).toHaveLength(1);
        const balance = await wallet.getBalance(f.accountId);
        expect(balance).toBe(1000);
      }
    }, 120_000);

    it('a request approval and a purchase: decided entirely before (old limit) or entirely after (new limit)', async () => {
      const boosts = t.app.get(DailyLimitBoostsRepository);
      for (let round = 0; round < 4; round++) {
        const f = await family({
          balance: 5000,
          daily: 3000,
          perPurchase: 3000,
        });
        await purchase(f, 2000).expect(200); // 1000 left today
        const parentWallet = await wallet.getOrCreateUserWallet(f.parent.id);
        await fund(parentWallet._id, 10000);
        const today = riyadhDate(new Date());
        const approval = wallet.runInTransaction(async (s) => {
          await wallet.transfer(
            {
              type: EntryType.REQUEST_APPROVAL,
              fromAccountId: parentWallet._id,
              toAccountId: f.accountId,
              amountHalalas: 5000,
              idempotencyKey: `request:${randomUUID()}`,
              initiator: {
                kind: 'parent',
                userId: new Types.ObjectId(f.parent.id),
              },
            },
            s,
          );
          await boosts.addBoost(
            new Types.ObjectId(f.child.id),
            today,
            5000,
            new Types.ObjectId(),
            s,
          );
        });
        const [, bought] = await Promise.all([approval, purchase(f, 2000)]);
        const s = await summary(f);
        if (bought.body.data.outcome === 'approved') {
          // After the approval: new limit (8000), spent 4000, balance 5000 + 5000 − 2000 − 2000.
          expect(s).toMatchObject({
            spentTodayHalalas: 4000,
            balanceHalalas: 6000,
            effectiveDailyLimitHalalas: 8000,
          });
        } else {
          // Before the approval: old limit, declined as over the daily limit, nothing mixed in.
          expect(bought.body.data.declineReason).toBe('OVER_DAILY_LIMIT');
          expect(s).toMatchObject({
            spentTodayHalalas: 2000,
            balanceHalalas: 8000,
            effectiveDailyLimitHalalas: 8000,
          });
        }
        expect(s.spentTodayHalalas).toBeLessThanOrEqual(
          s.effectiveDailyLimitHalalas,
        );
      }
    }, 120_000);

    it('a refund and a purchase: spent today and the balance match the committed movements', async () => {
      for (let round = 0; round < 4; round++) {
        const f = await family({
          balance: 10000,
          daily: 5000,
          perPurchase: 3000,
        });
        const first = (await purchase(f, 2000).expect(200)).body.data;
        const [refunded, bought] = await Promise.all([
          refund(f, first.transactionId, 2000),
          purchase(f, 2500),
        ]);
        expect(refunded.status).toBe(200);
        const approvedBought = bought.body.data.outcome === 'approved';
        const s = await summary(f);
        expect(s.spentTodayHalalas).toBe(approvedBought ? 2500 : 0);
        expect(s.balanceHalalas).toBe(10000 - (approvedBought ? 2500 : 0));
        // The counter agrees with the committed records.
        const counter = await t.app
          .get(SpendCounterService)
          .compute(f.child.id, riyadhDate(new Date()));
        expect(counter).toBe(s.spentTodayHalalas);
      }
    }, 120_000);
  });

  // ───────────────────────────── refunds ─────────────────────────────

  describe('refunds (FR-044)', () => {
    it('US2-8: a same-day refund puts money back and lowers spent today', async () => {
      const f = await family({
        balance: 20000,
        daily: 5000,
        perPurchase: 3000,
      });
      const bought = (await purchase(f, 2500).expect(200)).body.data;
      const refunded = (await refund(f, bought.transactionId, 2500).expect(200))
        .body.data;
      expect(refunded.creditedTo).toBe('child');
      expect(refunded.summary).toMatchObject({
        balanceHalalas: 20000,
        spentTodayHalalas: 0,
        availableTodayHalalas: 5000,
      });
    }, 60_000);

    it('a refund on a later day credits the balance but leaves today’s spent figure alone', async () => {
      const f = await family({
        balance: 20000,
        daily: 5000,
        perPurchase: 3000,
      });
      const card = (await cardModel.findOne({
        childUserId: new Types.ObjectId(f.child.id),
      }))!;
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const old = await events.handle(
        {
          kind: 'authorization_request',
          issuerTxnId: `sim_${randomUUID()}`,
          cardRef: card.cardRef,
          amountHalalas: 2000,
          merchantName: 'Bookshop',
          category: 'education',
          occurredAt: twoDaysAgo,
        },
        'simulation',
      );
      expect(old.result).toMatchObject({ outcome: 'approved' });
      const before = await summary(f);
      expect(before).toMatchObject({
        balanceHalalas: 18000,
        spentTodayHalalas: 0,
      });
      const res = (
        await refund(
          f,
          (old.result as { transactionId: string }).transactionId,
          2000,
        ).expect(200)
      ).body.data;
      expect(res.summary).toMatchObject({
        balanceHalalas: 20000,
        spentTodayHalalas: 0,
      });
    }, 60_000);

    it('allows partial refunds, then 409 REFUND_EXCEEDS_REMAINING above what is left', async () => {
      const f = await family({
        balance: 20000,
        daily: 5000,
        perPurchase: 3000,
      });
      const bought = (await purchase(f, 2500).expect(200)).body.data;
      await refund(f, bought.transactionId, 1000).expect(200);
      await refund(f, bought.transactionId, 1000).expect(200);
      const over = await refund(f, bought.transactionId, 501).expect(409);
      expect(over.body.error).toBe('REFUND_EXCEEDS_REMAINING');
      await refund(f, bought.transactionId, 500).expect(200);
      const done = await refund(f, bought.transactionId, 1).expect(409);
      expect(done.body.error).toBe('REFUND_EXCEEDS_REMAINING');
      expect(await summary(f)).toMatchObject({
        balanceHalalas: 20000,
        spentTodayHalalas: 0,
      });
    }, 60_000);

    it('two concurrent refunds never credit more than the purchase', async () => {
      const f = await family({
        balance: 20000,
        daily: 5000,
        perPurchase: 3000,
      });
      const bought = (await purchase(f, 2500).expect(200)).body.data;
      const results = await Promise.all(
        Array.from({ length: 4 }, () => refund(f, bought.transactionId, 1500)),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      expect((await summary(f)).balanceHalalas).toBe(20000 - 2500 + 1500);
    }, 60_000);

    it('a refund on a paused card is still credited', async () => {
      const f = await family({
        balance: 20000,
        daily: 5000,
        perPurchase: 3000,
      });
      const bought = (await purchase(f, 2500).expect(200)).body.data;
      await cardModel.updateOne(
        { childUserId: new Types.ObjectId(f.child.id) },
        { $set: { status: 'paused' } },
      );
      const res = (await refund(f, bought.transactionId, 2500).expect(200)).body
        .data;
      expect(res.summary.balanceHalalas).toBe(20000);
    }, 60_000);

    it('cannot refund another child’s purchase or a declined one', async () => {
      const a = await family({ balance: 20000 });
      const b = await family({ balance: 20000 });
      const bought = (await purchase(a, 1000).expect(200)).body.data;
      await refund(b, bought.transactionId, 1000).expect(404);
      const declined = (await purchase(a, 99999).expect(200)).body.data;
      expect(declined.outcome).toBe('declined');
      await refund(a, declined.transactionId, 100).expect(404);
    }, 60_000);
  });

  // ───────────────── records, notifications and fail-closed ─────────────────

  it('US2-9: a declined purchase appears in both transaction lists with amount, merchant, time and reason', async () => {
    const f = await family({ balance: 20000, daily: 5000, perPurchase: 3000 });
    await purchase(f, 2500, 'food_dining', 'School canteen').expect(200);
    await purchase(f, 3001, 'gaming', 'Toy Store').expect(200);
    for (const [path, auth] of [
      ['/allowance/me/transactions', f.child.auth],
      [`/allowance/children/${f.child.id}/transactions`, f.parent.auth],
    ] as const) {
      const items = (await request(http()).get(path).set(auth).expect(200)).body
        .data.items;
      expect(items.map((i: any) => i.kind)).toEqual([
        'purchase_declined',
        'purchase',
      ]);
      expect(items[0]).toMatchObject({
        kind: 'purchase_declined',
        direction: 'none',
        amountHalalas: 3001,
        merchantName: 'Toy Store',
        declineReason: 'OVER_PER_PURCHASE_LIMIT',
        currency: 'SAR',
      });
      expect(items[0].occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(items[1]).toMatchObject({
        kind: 'purchase',
        direction: 'out',
        amountHalalas: 2500,
        merchantName: 'School canteen',
      });
    }
  }, 60_000);

  it('US2-10: a decline notifies the child; an approved purchase notifies the child of nothing', async () => {
    const f = await family({ balance: 20000, daily: 5000, perPurchase: 3000 });
    pushSpy.mockClear();
    await purchase(f, 2500).expect(200);
    expect(pushSpy.mock.calls.filter((c) => c[0] === f.child.id)).toHaveLength(
      0,
    );

    await purchase(f, 3001, 'gaming', 'Toy Store').expect(200);
    const toChild = pushSpy.mock.calls.filter((c) => c[0] === f.child.id);
    expect(toChild).toHaveLength(1);
    const message = toChild[0][1] as {
      type: string;
      render: (l: 'en' | 'ar') => { body: string };
    };
    expect(message.type).toBe('allowance.purchaseDeclined');
    expect(message.render('en').body).toBe(
      'Declined: 30.01 SAR at Toy Store. Over per-purchase limit',
    );
    expect(message.render('ar').body).toContain('30.01 ر.س');
  }, 60_000);

  it('paginates the transaction list with an opaque cursor, newest first', async () => {
    const f = await family({ balance: 20000, daily: 9000, perPurchase: 3000 });
    for (let i = 0; i < 5; i++) await purchase(f, 100 + i).expect(200);
    const page1 = (
      await request(http())
        .get('/allowance/me/transactions?limit=2')
        .set(f.child.auth)
        .expect(200)
    ).body.data;
    expect(page1.items.map((i: any) => i.amountHalalas)).toEqual([104, 103]);
    expect(page1.nextCursor).toEqual(expect.any(String));
    const page2 = (
      await request(http())
        .get(`/allowance/me/transactions?limit=2&cursor=${page1.nextCursor}`)
        .set(f.child.auth)
        .expect(200)
    ).body.data;
    expect(page2.items.map((i: any) => i.amountHalalas)).toEqual([102, 101]);
    const page3 = (
      await request(http())
        .get(`/allowance/me/transactions?limit=2&cursor=${page2.nextCursor}`)
        .set(f.child.auth)
        .expect(200)
    ).body.data;
    expect(page3.items.map((i: any) => i.amountHalalas)).toEqual([100]);
    expect(page3.nextCursor).toBeNull();
    await request(http())
      .get('/allowance/me/transactions?limit=101')
      .set(f.child.auth)
      .expect(400);
    await request(http())
      .get('/allowance/me/transactions?cursor=garbage')
      .set(f.child.auth)
      .expect(400);
  }, 60_000);

  it('a duplicate issuer transaction id returns the first outcome and moves no money twice', async () => {
    const f = await family({ balance: 20000, daily: 5000, perPurchase: 3000 });
    const card = (await cardModel.findOne({
      childUserId: new Types.ObjectId(f.child.id),
    }))!;
    const event = {
      kind: 'authorization_request' as const,
      issuerTxnId: `iss_${randomUUID()}`,
      cardRef: card.cardRef,
      amountHalalas: 2000,
      merchantName: 'Cafe',
      category: 'food_dining' as const,
      occurredAt: new Date(),
    };
    const [a, b, c] = await Promise.all([
      events.handle(event, 'issuer'),
      events.handle(event, 'issuer'),
      events.handle(event, 'issuer'),
    ]);
    const ids = new Set(
      [a, b, c].map(
        (o) => (o.result as { transactionId: string }).transactionId,
      ),
    );
    expect(ids.size).toBe(1);
    expect(
      await txnModel.countDocuments({ issuerTxnId: event.issuerTxnId }),
    ).toBe(1);
    expect(await summary(f)).toMatchObject({
      balanceHalalas: 18000,
      spentTodayHalalas: 2000,
    });
  }, 60_000);

  it('fails closed when the ledger is unavailable: SERVICE_UNAVAILABLE is recorded and no money moves', async () => {
    const f = await family({ balance: 20000 });
    const health = t.app.get(LedgerHealthService);
    health.setAvailable(false);
    try {
      const res = (await purchase(f, 500).expect(200)).body.data;
      expect(res).toMatchObject({
        outcome: 'declined',
        declineReason: 'SERVICE_UNAVAILABLE',
      });
    } finally {
      health.setAvailable(true);
    }
    const entries = await t.app
      .get(LedgerEntriesRepository)
      .findForAccount(f.accountId, { types: [EntryType.PURCHASE] });
    expect(entries).toHaveLength(0);
    expect((await summary(f)).balanceHalalas).toBe(20000);
    const items = (
      await request(http())
        .get('/allowance/me/transactions')
        .set(f.child.auth)
        .expect(200)
    ).body.data.items;
    expect(items[0]).toMatchObject({
      kind: 'purchase_declined',
      declineReason: 'SERVICE_UNAVAILABLE',
    });
  }, 60_000);

  // ───────────────────────────── guards ─────────────────────────────

  it('/dev/* without x-admin-key → 401, and a parent must name an owned child', async () => {
    const f = await family({ balance: 20000 });
    const body = {
      merchantName: 'X',
      category: 'food_dining',
      amountHalalas: 100,
    };
    await request(http())
      .post('/dev/cards/simulate/purchase')
      .set(f.child.auth)
      .send(body)
      .expect(401);
    await request(http())
      .post('/dev/cards/simulate/purchase')
      .set(f.child.auth)
      .set('x-admin-key', 'wrong')
      .send(body)
      .expect(401);
    await request(http())
      .post('/dev/cards/simulate/purchase')
      .send(body)
      .expect(401);
    // A parent without childId, and a parent naming someone else's child.
    await adminPost('/dev/cards/simulate/purchase', f.parent)
      .send(body)
      .expect(400);
    const other = await family({ balance: 1000 });
    await adminPost('/dev/cards/simulate/purchase', f.parent)
      .send({ ...body, childId: other.child.id })
      .expect(404);
    // The owning parent can act for the child.
    const ok = await adminPost('/dev/cards/simulate/purchase', f.parent)
      .send({ ...body, childId: f.child.id })
      .expect(200);
    expect(ok.body.data.outcome).toBe('approved');
  }, 60_000);
});
