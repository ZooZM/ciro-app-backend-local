import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { OpsAlertModule } from '../src/common/ops-alert/ops-alert.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RedisModule } from '../src/modules/redis/redis.module';
import { WalletModule } from '../src/modules/wallet/wallet.module';
import { WalletDevModule } from '../src/modules/wallet/dev/wallet-dev.module';
import { FamilyCoreModule } from '../src/modules/family-core/family-core.module';
import { CardsModule } from '../src/modules/cards/cards.module';
import { FamilyModule } from '../src/modules/family/family.module';
import { AllowanceModule } from '../src/modules/allowance/allowance.module';
import { CardsDevModule } from '../src/modules/cards/dev/cards-dev.module';
import { AllowanceDevModule } from '../src/modules/allowance/dev/allowance-dev.module';
import { AllowanceRequestsModule } from '../src/modules/allowance-requests/allowance-requests.module';
import { ChildSummaryService } from '../src/modules/family-core/child-summary.service';
import { CardEventsService } from '../src/modules/cards/card-events.service';
import { LedgerHealthService } from '../src/modules/wallet/ledger-health.service';
import { ReconciliationService } from '../src/modules/wallet/reconciliation.service';
import { OpsAlertService } from '../src/common/ops-alert/ops-alert.service';
import {
  Card,
  CardDocument,
} from '../src/modules/family-core/schemas/card.schema';
import {
  CardTransaction,
  CardTransactionDocument,
} from '../src/modules/family-core/schemas/card-transaction.schema';
import {
  AllowanceRequest,
  AllowanceRequestDocument,
} from '../src/modules/family-core/schemas/allowance-request.schema';
import { LedgerEntry } from '../src/modules/wallet/schemas/ledger-entry.schema';
import { DeviceToken } from '../src/modules/notifications/device-token.schema';
import { PushService } from '../src/modules/notifications/push.service';
import { EntryType } from '../src/modules/wallet/schemas/ledger-entry.schema';
import { addMonths, riyadhMonth } from '../src/common/utils/riyadh-time.util';
import { ChatGateway } from '../src/modules/chat/chat.gateway';
import { LinkCodesService } from '../src/modules/family/link-codes.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import {
  LedgerAccount,
  LedgerAccountDocument,
} from '../src/modules/wallet/schemas/ledger-account.schema';
import { Model } from 'mongoose';
import { bootTestApp, TEST_ADMIN_KEY, TestApp } from './helpers/replset';
import { createUser, TestUser } from './helpers/users';

/**
 * 026 e2e: US1–US8 happy and edge paths plus the security block, against a
 * real single-node replica set and live Redis (quickstart §2). Blocks are
 * appended per story.
 */
describe('Kids allowance (e2e)', () => {
  let t: TestApp;
  let wallet: WalletService;
  let emitted: { userId: string; event: string; payload: any }[];
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
        AllowanceRequestsModule,
        WalletDevModule,
        CardsDevModule,
        AllowanceDevModule,
      ],
      override: (b) =>
        b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    });
    wallet = t.app.get(WalletService);
    const gateway = t.app.get(ChatGateway);
    jest
      .spyOn(gateway, 'emitToUser')
      .mockImplementation((userId, event, payload) => {
        emitted.push({ userId, event, payload });
      });
    pushSpy = jest
      .spyOn(t.app.get(PushService), 'sendToUser')
      .mockResolvedValue(undefined);
  }, 180_000);

  beforeEach(() => {
    emitted = [];
  });

  afterAll(async () => {
    await t?.close();
  });

  /** Links `child` to `parent` over HTTP and returns the child's list item. */
  async function link(parent: TestUser, child: TestUser) {
    const created = await request(http())
      .post('/family/link-codes')
      .set(parent.auth)
      .expect(200);
    const code: string = created.body.data.code;
    await request(http())
      .post('/family/link-codes/claim')
      .set(child.auth)
      .send({ code })
      .expect(200);
    const confirmed = await request(http())
      .post('/family/link-codes/current/confirm')
      .set(parent.auth)
      .expect(200);
    return { code, child: confirmed.body.data.child };
  }

  const settingsBody = {
    monthlyAmountHalalas: 30000,
    payoutDay: 15,
    dailyLimitHalalas: 5000,
    perPurchaseMaxHalalas: 3000,
    blockedCategories: ['gaming'],
    purchaseNotifications: true,
  };

  // ───────────────────────── US1: link and settings ─────────────────────────
  describe('US1: link a child and set the allowance', () => {
    it('runs the full link flow over HTTP: create → preview → claim → current → confirm', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');

      const created = await request(http())
        .post('/family/link-codes')
        .set(parent.auth)
        .expect(200);
      const { code, qrPayload, expiresAt } = created.body.data;
      expect(qrPayload).toBe(`cirochat://family/link?c=${code}`);
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(
        Date.now() + 590_000,
      );

      const preview = await request(http())
        .post('/family/link-codes/preview')
        .set(child.auth)
        .send({ code })
        .expect(200);
      expect(preview.body.data.parent.name).toBe('Mama');
      // Preview has no side effects (FR-002): the code is still claimable.
      expect(
        (
          await request(http())
            .get('/family/link-codes/current')
            .set(parent.auth)
            .expect(200)
        ).body.data,
      ).toMatchObject({ state: 'issued', child: null });

      await request(http())
        .post('/family/link-codes/claim')
        .set(child.auth)
        .send({ code })
        .expect(200);
      expect(emitted).toContainEqual(
        expect.objectContaining({
          userId: parent.id,
          event: 'familyLinkClaimed',
          payload: expect.objectContaining({
            child: expect.objectContaining({ id: child.id, name: 'Sara' }),
          }),
        }),
      );

      const current = await request(http())
        .get('/family/link-codes/current')
        .set(parent.auth)
        .expect(200);
      expect(current.body.data).toMatchObject({
        state: 'claimed',
        child: { id: child.id, name: 'Sara', phoneNumber: child.phoneNumber },
      });

      const confirmed = await request(http())
        .post('/family/link-codes/current/confirm')
        .set(parent.auth)
        .expect(200);
      expect(confirmed.body.data.child).toMatchObject({
        childId: child.id,
        name: 'Sara',
        balanceHalalas: 0,
        cardStatus: 'active',
        hasPendingRequest: false,
        currency: 'SAR',
      });
      expect(emitted).toContainEqual(
        expect.objectContaining({
          userId: child.id,
          event: 'allowanceUpdated',
          payload: expect.objectContaining({
            reason: 'linked',
            childId: child.id,
          }),
        }),
      );

      // The code is gone after confirm.
      await request(http())
        .post('/family/link-codes/claim')
        .set(child.auth)
        .send({ code })
        .expect(404);
    }, 60_000);

    it('GET /family/me returns the right role for parent, child and none', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      const nobody = await createUser(t.app, 'Nobody');
      await link(parent, child);

      const asParent = await request(http())
        .get('/family/me')
        .set(parent.auth)
        .expect(200);
      expect(asParent.body.data.role).toBe('parent');
      expect(asParent.body.data.children).toHaveLength(1);
      expect(asParent.body.data.children[0].childId).toBe(child.id);

      const asChild = await request(http())
        .get('/family/me')
        .set(child.auth)
        .expect(200);
      expect(asChild.body.data).toMatchObject({
        role: 'child',
        parent: { id: parent.id, name: 'Mama' },
        children: [],
      });

      const asNone = await request(http())
        .get('/family/me')
        .set(nobody.auth)
        .expect(200);
      expect(asNone.body.data).toEqual({
        role: 'none',
        parent: null,
        children: [],
      });
    }, 60_000);

    it('refuses a used code and an expired code', async () => {
      const parent = await createUser(t.app, 'Mama');
      const first = await createUser(t.app, 'First');
      const second = await createUser(t.app, 'Second');

      const { code } = (
        await request(http())
          .post('/family/link-codes')
          .set(parent.auth)
          .expect(200)
      ).body.data;
      await request(http())
        .post('/family/link-codes/claim')
        .set(first.auth)
        .send({ code })
        .expect(200);

      const used = await request(http())
        .post('/family/link-codes/claim')
        .set(second.auth)
        .send({ code })
        .expect(409);
      expect(used.body.error).toBe('LINK_CODE_ALREADY_USED');
      const usedPreview = await request(http())
        .post('/family/link-codes/preview')
        .set(second.auth)
        .send({ code })
        .expect(409);
      expect(usedPreview.body.error).toBe('LINK_CODE_ALREADY_USED');

      const fresh = (
        await request(http())
          .post('/family/link-codes')
          .set(parent.auth)
          .expect(200)
      ).body.data.code;
      await t.redis.del(LinkCodesService.key(fresh));
      const expired = await request(http())
        .post('/family/link-codes/claim')
        .set(second.auth)
        .send({ code: fresh })
        .expect(404);
      expect(expired.body.error).toBe('LINK_CODE_INVALID_OR_EXPIRED');
      const unknown = await request(http())
        .post('/family/link-codes/preview')
        .set(second.auth)
        .send({ code: 'nope' })
        .expect(404);
      expect(unknown.body.error).toBe('LINK_CODE_INVALID_OR_EXPIRED');
    }, 60_000);

    it('applies the role rules with distinct error codes', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      const other = await createUser(t.app, 'Other');
      await link(parent, child);

      const code = async (u: TestUser) =>
        (
          await request(http())
            .post('/family/link-codes')
            .set(u.auth)
            .expect(200)
        ).body.data.code as string;

      // A parent scanning their own code.
      const own = await code(parent);
      expect(
        (
          await request(http())
            .post('/family/link-codes/claim')
            .set(parent.auth)
            .send({ code: own })
            .expect(409)
        ).body.error,
      ).toBe('CANNOT_LINK_SELF');
      // A linked child cannot make a code.
      expect(
        (
          await request(http())
            .post('/family/link-codes')
            .set(child.auth)
            .expect(409)
        ).body.error,
      ).toBe('ACCOUNT_IS_CHILD');
      // A linked child cannot be claimed into another family.
      const otherCode = await code(other);
      expect(
        (
          await request(http())
            .post('/family/link-codes/claim')
            .set(child.auth)
            .send({ code: otherCode })
            .expect(409)
        ).body.error,
      ).toBe('CHILD_ALREADY_LINKED');
      // A parent with children cannot become a child.
      expect(
        (
          await request(http())
            .post('/family/link-codes/claim')
            .set(parent.auth)
            .send({ code: otherCode })
            .expect(409)
        ).body.error,
      ).toBe('ACCOUNT_IS_PARENT');
      // Confirming before a claim.
      const unclaimed = await createUser(t.app, 'Quiet');
      await code(unclaimed);
      expect(
        (
          await request(http())
            .post('/family/link-codes/current/confirm')
            .set(unclaimed.auth)
            .expect(409)
        ).body.error,
      ).toBe('LINK_CODE_NOT_CLAIMED');
    }, 60_000);

    it('stops at 10 children (FR-005)', async () => {
      const parent = await createUser(t.app, 'Big Family');
      for (let i = 0; i < 10; i++)
        await link(parent, await createUser(t.app, `Kid ${i}`));
      const refused = await request(http())
        .post('/family/link-codes')
        .set(parent.auth)
        .expect(409);
      expect(refused.body.error).toBe('MAX_CHILDREN_REACHED');
    }, 180_000);

    it('freezes the child’s own wallet (FR-008)', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      const accounts = t.app.get<Model<LedgerAccountDocument>>(
        getModelToken(LedgerAccount.name),
      );
      const own = await accounts.findOne({
        kind: 'user_wallet',
        ownerUserId: new Types.ObjectId(child.id),
      });
      expect(own?.frozen).toBe(true);
      expect(
        await accounts.findOne({
          kind: 'child_balance',
          ownerUserId: new Types.ObjectId(child.id),
        }),
      ).toBeTruthy();
      await request(http())
        .post('/dev/wallet/simulate/top-up')
        .set(child.auth)
        .set('x-admin-key', TEST_ADMIN_KEY)
        .set('Idempotency-Key', '7d2f0b1e-6a8c-4f21-8d3e-5b9c1a2d3e4f')
        .send({ amountHalalas: 1000 })
        .expect(409);
    }, 60_000);

    it('lets the parent set every setting and the child read them (read-only)', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);

      const defaults = await request(http())
        .get(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .expect(200);
      expect(defaults.body.data).toMatchObject({
        monthlyAmountHalalas: 0,
        payoutDay: 1,
        dailyLimitHalalas: 5000,
        perPurchaseMaxHalalas: 5000,
        blockedCategories: [],
        purchaseNotifications: true,
        alwaysBlockedCategories: ['gambling', 'alcohol_tobacco', 'adult'],
        nextPayoutDate: null,
      });

      emitted = [];
      const saved = await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send(settingsBody)
        .expect(200);
      expect(saved.body.data).toMatchObject({
        ...settingsBody,
        currency: 'SAR',
      });
      expect(saved.body.data.nextPayoutDate).toMatch(/^\d{4}-\d{2}-15$/);

      const events = emitted.filter(
        (e) =>
          e.event === 'allowanceUpdated' && e.payload.reason === 'settings',
      );
      expect(events.map((e) => e.userId).sort()).toEqual(
        [child.id, parent.id].sort(),
      );

      const mine = await request(http())
        .get('/allowance/me/settings')
        .set(child.auth)
        .expect(200);
      expect(mine.body.data).toMatchObject({
        dailyLimitHalalas: 5000,
        perPurchaseMaxHalalas: 3000,
        blockedCategories: ['gaming'],
      });

      const summary = await request(http())
        .get('/allowance/me/summary')
        .set(child.auth)
        .expect(200);
      expect(summary.body.data).toMatchObject({
        childId: child.id,
        childName: 'Sara',
        balanceHalalas: 0,
        availableTodayHalalas: 0,
        effectiveDailyLimitHalalas: 5000,
        cardStatus: 'active',
        pendingRequest: null,
        failedPayout: null,
        limits: {
          dailyLimitHalalas: 5000,
          perPurchaseMaxHalalas: 3000,
          maxRequestHalalas: 50000,
        },
      });
      expect(summary.body.data.rev).toBeGreaterThan(1);
    }, 60_000);

    it('US1-6 and validation: rejects bad settings with 400', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      const put = (body: object) =>
        request(http())
          .put(`/allowance/children/${child.id}/settings`)
          .set(parent.auth)
          .send(body);

      const above = await put({
        ...settingsBody,
        dailyLimitHalalas: 2000,
        perPurchaseMaxHalalas: 2500,
      }).expect(400);
      expect(above.body.error).toBe('PER_PURCHASE_ABOVE_DAILY_LIMIT');
      await put({ ...settingsBody, blockedCategories: ['gambling'] }).expect(
        400,
      );
      await put({ ...settingsBody, monthlyAmountHalalas: 12.5 }).expect(400);
      await put({ ...settingsBody, monthlyAmountHalalas: 99_999_999 }).expect(
        400,
      );
      await put({ ...settingsBody, payoutDay: 32 }).expect(400);
      await put({ ...settingsBody, dailyLimitHalalas: 0 }).expect(400);
      const partial: Partial<typeof settingsBody> = { ...settingsBody };
      delete partial.purchaseNotifications;
      await put(partial).expect(400);
    }, 60_000);

    it('a child cannot change settings and a stranger cannot read a child (404, no probing)', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      const stranger = await createUser(t.app, 'Stranger');
      await link(parent, child);

      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(child.auth)
        .send(settingsBody)
        .expect(404);
      const peek = await request(http())
        .get(`/allowance/children/${child.id}/summary`)
        .set(stranger.auth)
        .expect(404);
      expect(peek.body.error).toBe('CHILD_NOT_FOUND');
      const peekNone = await request(http())
        .get(`/allowance/children/${new Types.ObjectId().toString()}/summary`)
        .set(stranger.auth)
        .expect(404);
      expect(peekNone.body.error).toBe('CHILD_NOT_FOUND');
      const notChild = await request(http())
        .get('/allowance/me/summary')
        .set(stranger.auth)
        .expect(404);
      expect(notChild.body.error).toBe('NOT_A_LINKED_CHILD');
      // And without a token nothing works.
      await request(http()).get('/family/me').expect(401);
    }, 60_000);
  });

  // ───────────── US6: parent manages money and the card ─────────────
  describe('US6: balance controls and card pause/resume', () => {
    const adminPost = (path: string, user: TestUser) =>
      request(http())
        .post(path)
        .set(user.auth)
        .set('x-admin-key', TEST_ADMIN_KEY);
    const idem = () => randomUUID();

    async function fundParent(parent: TestUser, halalas: number) {
      await adminPost('/dev/wallet/simulate/top-up', parent)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: halalas })
        .expect(200);
    }

    it('US6-1/2: top-up and pull-back move money between the wallets; both are recorded', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await fundParent(parent, 20000);

      const top = await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: 10000 })
        .expect(200);
      expect(top.body.data).toMatchObject({
        parentBalanceHalalas: 10000,
        summary: { balanceHalalas: 10000 },
      });

      const pull = await request(http())
        .post(`/allowance/children/${child.id}/pull-backs`)
        .set(parent.auth)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: 4000 })
        .expect(200);
      expect(pull.body.data).toMatchObject({
        parentBalanceHalalas: 14000,
        summary: { balanceHalalas: 6000 },
      });

      const me = await request(http())
        .get('/wallet/me')
        .set(parent.auth)
        .expect(200);
      expect(me.body.data.balanceHalalas).toBe(14000);
      const items = (
        await request(http())
          .get('/allowance/me/transactions')
          .set(child.auth)
          .expect(200)
      ).body.data.items;
      expect(
        items.map((i: any) => [i.kind, i.direction, i.amountHalalas]),
      ).toEqual([
        ['pull_back', 'out', 4000],
        ['top_up', 'in', 10000],
      ]);
    }, 60_000);

    it('a top-up with too little in the wallet → 409 INSUFFICIENT_FUNDS and nothing moves', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await fundParent(parent, 1000);
      const res = await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: 1001 })
        .expect(409);
      expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
      expect(
        (await request(http()).get('/wallet/me').set(parent.auth)).body.data
          .balanceHalalas,
      ).toBe(1000);
    }, 60_000);

    it('US6-3: a pull-back above the child balance → 409 AMOUNT_EXCEEDS_CHILD_BALANCE', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await fundParent(parent, 5000);
      await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: 2000 })
        .expect(200);
      const res = await request(http())
        .post(`/allowance/children/${child.id}/pull-backs`)
        .set(parent.auth)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: 2001 })
        .expect(409);
      expect(res.body.error).toBe('AMOUNT_EXCEEDS_CHILD_BALANCE');
    }, 60_000);

    it('replaying an Idempotency-Key returns the same entry and moves money once; a missing key is a 400', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await fundParent(parent, 10000);
      const key = idem();
      const send = () =>
        request(http())
          .post(`/allowance/children/${child.id}/top-ups`)
          .set(parent.auth)
          .set('Idempotency-Key', key)
          .send({ amountHalalas: 3000 });
      const [a, b, c] = await Promise.all([send(), send(), send()]);
      expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
      expect(new Set([a, b, c].map((r) => r.body.data.entryId)).size).toBe(1);
      expect(
        (await request(http()).get('/wallet/me').set(parent.auth)).body.data
          .balanceHalalas,
      ).toBe(7000);

      const missing = await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .send({ amountHalalas: 100 })
        .expect(400);
      expect(missing.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
      await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .set('Idempotency-Key', 'not-a-uuid')
        .send({ amountHalalas: 100 })
        .expect(400);
    }, 60_000);

    it('rejects bad amounts and non-owners', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      const stranger = await createUser(t.app, 'Stranger');
      await link(parent, child);
      const post = (u: TestUser, body: object) =>
        request(http())
          .post(`/allowance/children/${child.id}/top-ups`)
          .set(u.auth)
          .set('Idempotency-Key', idem())
          .send(body);
      await post(parent, { amountHalalas: 0 }).expect(400);
      await post(parent, { amountHalalas: -5 }).expect(400);
      await post(parent, { amountHalalas: 10.5 }).expect(400);
      await post(parent, { amountHalalas: 99_999_999 }).expect(400);
      await post(stranger, { amountHalalas: 100 }).expect(404);
      await post(child, { amountHalalas: 100 }).expect(404);
    }, 60_000);

    it('US6-4: pausing declines the next purchase as CARD_PAUSED; resuming approves the same purchase', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await fundParent(parent, 10000);
      await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .set('Idempotency-Key', idem())
        .send({ amountHalalas: 10000 })
        .expect(200);
      const buy = () =>
        adminPost('/dev/cards/simulate/purchase', child).send({
          merchantName: 'Cafe',
          category: 'food_dining',
          amountHalalas: 1000,
        });

      expect(
        (
          await request(http())
            .get(`/cards/children/${child.id}`)
            .set(parent.auth)
            .expect(200)
        ).body.data,
      ).toMatchObject({ status: 'active', provider: 'stub' });
      expect(
        (
          await request(http())
            .post(`/cards/children/${child.id}/pause`)
            .set(parent.auth)
            .expect(200)
        ).body.data,
      ).toEqual({ status: 'paused' });
      expect(
        (await request(http()).get('/cards/me').set(child.auth).expect(200))
          .body.data.status,
      ).toBe('paused');
      expect((await buy().expect(200)).body.data).toMatchObject({
        outcome: 'declined',
        declineReason: 'CARD_PAUSED',
      });

      expect(
        (
          await request(http())
            .post(`/cards/children/${child.id}/resume`)
            .set(parent.auth)
            .expect(200)
        ).body.data,
      ).toEqual({ status: 'active' });
      expect((await buy().expect(200)).body.data.outcome).toBe('approved');
    }, 60_000);

    it('card routes are parent-only (404 for the child and strangers); the child sees the card change event', async () => {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      const stranger = await createUser(t.app, 'Stranger');
      await link(parent, child);
      await request(http())
        .post(`/cards/children/${child.id}/pause`)
        .set(child.auth)
        .expect(404);
      await request(http())
        .post(`/cards/children/${child.id}/pause`)
        .set(stranger.auth)
        .expect(404);
      await request(http())
        .get(`/cards/children/${child.id}`)
        .set(stranger.auth)
        .expect(404);
      await request(http()).get('/cards/me').set(stranger.auth).expect(404);
      emitted = [];
      await request(http())
        .post(`/cards/children/${child.id}/pause`)
        .set(parent.auth)
        .expect(200);
      expect(
        emitted
          .filter(
            (e) =>
              e.event === 'allowanceUpdated' &&
              e.payload.reason === 'card_paused',
          )
          .map((e) => e.userId)
          .sort(),
      ).toEqual([child.id, parent.id].sort());
    }, 60_000);
  });

  // ───────────── US3: monthly allowance is paid automatically ─────────────
  describe('US3: monthly payouts', () => {
    const nextMonth = addMonths(riyadhMonth(new Date()), 1);
    const payDay = `${nextMonth}-20T10:00:00.000Z`; // after a payout day of 15, in the month after today
    const eveOfPayDay = `${nextMonth}-14T15:00:00.000Z`;
    const adminPost = (path: string, user: TestUser) =>
      request(http())
        .post(path)
        .set(user.auth)
        .set('x-admin-key', TEST_ADMIN_KEY);
    const runJob = (user: TestUser, job: string, asOf: string) =>
      adminPost(`/dev/allowance/jobs/${job}/run`, user).send({ asOf });

    async function setup(opts: {
      parentFunds: number;
      childFunds?: number;
      monthly?: number;
    }) {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      if (opts.parentFunds > 0) {
        await adminPost('/dev/wallet/simulate/top-up', parent)
          .set('Idempotency-Key', randomUUID())
          .send({ amountHalalas: opts.parentFunds })
          .expect(200);
      }
      if (opts.childFunds) {
        const account = (await wallet.findChildAccount(child.id))!;
        const from = await wallet.getSystemAccount('simulation_funding');
        await wallet.runInTransaction((sx) =>
          wallet.transfer(
            {
              type: EntryType.SIMULATED_FUNDING,
              fromAccountId: from,
              toAccountId: account._id,
              amountHalalas: opts.childFunds!,
              idempotencyKey: `seed:${randomUUID()}`,
              initiator: { kind: 'simulation' },
            },
            sx,
          ),
        );
      }
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send({
          ...settingsBody,
          monthlyAmountHalalas: opts.monthly ?? 30000,
          payoutDay: 15,
        })
        .expect(200);
      return { parent, child };
    }
    const parentBalance = async (p: TestUser) =>
      (await request(http()).get('/wallet/me').set(p.auth)).body.data
        .balanceHalalas as number;
    const childBalance = async (c: TestUser) =>
      (await request(http()).get('/allowance/me/summary').set(c.auth)).body.data
        .balanceHalalas as number;

    it('US3-1/7: pays once, moves the money, notifies both, and unspent money carries over', async () => {
      const { parent, child } = await setup({
        parentFunds: 50000,
        childFunds: 4000,
      });
      pushSpy.mockClear();
      const first = await runJob(parent, 'payouts', payDay).expect(200);
      expect(first.body.data).toEqual({ processed: 1 });
      expect(await parentBalance(parent)).toBe(20000);
      expect(await childBalance(child)).toBe(34000); // 40.00 carried over + 300.00
      const sent = pushSpy.mock.calls.map((c) => [
        c[0],
        (c[1] as { type: string }).type,
      ]);
      expect(sent).toEqual(
        expect.arrayContaining([
          [child.id, 'allowance.payoutPaid'],
          [parent.id, 'allowance.payoutPaid'],
        ]),
      );
      const items = (
        await request(http())
          .get('/allowance/me/transactions')
          .set(child.auth)
          .expect(200)
      ).body.data.items;
      expect(
        items.find((i: any) => i.kind === 'allowance_payout'),
      ).toMatchObject({ direction: 'in', amountHalalas: 30000 });
    }, 60_000);

    it('FR-034: a second run in the same month does nothing', async () => {
      const { parent } = await setup({ parentFunds: 100000 });
      expect(
        (await runJob(parent, 'payouts', payDay).expect(200)).body.data
          .processed,
      ).toBe(1);
      expect(
        (await runJob(parent, 'payouts', payDay).expect(200)).body.data
          .processed,
      ).toBe(0);
      expect(
        (
          await runJob(
            parent,
            'payouts',
            `${nextMonth}-25T10:00:00.000Z`,
          ).expect(200)
        ).body.data.processed,
      ).toBe(0);
      expect(await parentBalance(parent)).toBe(70000);
    }, 60_000);

    it('does not pay before the payout day, nor with a zero allowance', async () => {
      const early = await setup({ parentFunds: 50000 });
      expect(
        (
          await runJob(
            early.parent,
            'payouts',
            `${nextMonth}-14T10:00:00.000Z`,
          ).expect(200)
        ).body.data.processed,
      ).toBe(0);
      const zero = await setup({ parentFunds: 50000, monthly: 0 });
      expect(
        (await runJob(zero.parent, 'payouts', payDay).expect(200)).body.data
          .processed,
      ).toBe(0);
      expect(await parentBalance(zero.parent)).toBe(50000);
    }, 60_000);

    it('US3-2 and Pay now: too little in the wallet fails the payout; after funding, Pay now succeeds exactly once', async () => {
      const { parent, child } = await setup({ parentFunds: 10000 });
      pushSpy.mockClear();
      expect(
        (await runJob(parent, 'payouts', payDay).expect(200)).body.data
          .processed,
      ).toBe(1);
      expect(await parentBalance(parent)).toBe(10000);
      expect(await childBalance(child)).toBe(0);
      const failedPush = pushSpy.mock.calls.find(
        (c) => (c[1] as { type: string }).type === 'allowance.payoutFailed',
      );
      expect(failedPush?.[0]).toBe(parent.id);

      const summary = (
        await request(http())
          .get(`/allowance/children/${child.id}/summary`)
          .set(parent.auth)
          .expect(200)
      ).body.data;
      expect(summary.failedPayout).toMatchObject({
        month: nextMonth,
        amountHalalas: 30000,
        failureReason: 'INSUFFICIENT_FUNDS',
      });
      const items = (
        await request(http())
          .get(`/allowance/children/${child.id}/transactions`)
          .set(parent.auth)
          .expect(200)
      ).body.data.items;
      expect(items.find((i: any) => i.kind === 'payout_failed')).toMatchObject({
        direction: 'none',
        amountHalalas: 30000,
      });

      const payoutId = summary.failedPayout.payoutId;
      const tooPoor = await request(http())
        .post(`/allowance/children/${child.id}/payouts/${payoutId}/pay`)
        .set(parent.auth)
        .expect(409);
      expect(tooPoor.body.error).toBe('INSUFFICIENT_FUNDS');

      await adminPost('/dev/wallet/simulate/top-up', parent)
        .set('Idempotency-Key', randomUUID())
        .send({ amountHalalas: 30000 })
        .expect(200);
      const taps = await Promise.all([
        request(http())
          .post(`/allowance/children/${child.id}/payouts/${payoutId}/pay`)
          .set(parent.auth),
        request(http())
          .post(`/allowance/children/${child.id}/payouts/${payoutId}/pay`)
          .set(parent.auth),
      ]);
      expect(taps.map((r) => r.status).sort()).toEqual([200, 409]);
      const ok = taps.find((r) => r.status === 200)!;
      expect(ok.body.data.payout).toMatchObject({
        status: 'paid_late',
        month: nextMonth,
        amountHalalas: 30000,
      });
      expect(taps.find((r) => r.status === 409)!.body.error).toBe(
        'PAYOUT_NOT_PAYABLE',
      );
      expect(await parentBalance(parent)).toBe(10000);
      expect(await childBalance(child)).toBe(30000);

      // The month now has a row, so the job never pays it a second time.
      expect(
        (await runJob(parent, 'payouts', payDay).expect(200)).body.data
          .processed,
      ).toBe(0);
      const after = (
        await request(http())
          .get(`/allowance/children/${child.id}/summary`)
          .set(parent.auth)
      ).body.data;
      expect(after.failedPayout).toBeNull();
    }, 90_000);

    it('Pay now: unknown payouts, strangers and the child get refused', async () => {
      const { parent, child } = await setup({ parentFunds: 10000 });
      const stranger = await createUser(t.app, 'Stranger');
      await runJob(parent, 'payouts', payDay).expect(200);
      const summary = (
        await request(http())
          .get(`/allowance/children/${child.id}/summary`)
          .set(parent.auth)
      ).body.data;
      const payoutId = summary.failedPayout.payoutId;
      await request(http())
        .post(`/allowance/children/${child.id}/payouts/${payoutId}/pay`)
        .set(child.auth)
        .expect(404);
      await request(http())
        .post(`/allowance/children/${child.id}/payouts/${payoutId}/pay`)
        .set(stranger.auth)
        .expect(404);
      const unknown = await request(http())
        .post(
          `/allowance/children/${child.id}/payouts/${new Types.ObjectId().toString()}/pay`,
        )
        .set(parent.auth)
        .expect(409);
      expect(unknown.body.error).toBe('PAYOUT_NOT_PAYABLE');
    }, 60_000);

    it('reminders: only when the wallet is below tomorrow’s total, once a day', async () => {
      const { parent } = await setup({ parentFunds: 20000 });
      pushSpy.mockClear();
      expect(
        (await runJob(parent, 'reminders', eveOfPayDay).expect(200)).body.data
          .processed,
      ).toBe(1);
      expect(
        (await runJob(parent, 'reminders', eveOfPayDay).expect(200)).body.data
          .processed,
      ).toBe(0);
      const reminder = pushSpy.mock.calls.filter(
        (c) => (c[1] as { type: string }).type === 'allowance.payoutReminder',
      );
      expect(reminder).toHaveLength(1);
      expect(reminder[0][0]).toBe(parent.id);
      const body = (
        reminder[0][1] as { render: (l: 'en') => { body: string } }
      ).render('en').body;
      expect(body).toBe(
        "Tomorrow's allowance needs 300.00 SAR. Your wallet has 200.00 SAR.",
      );

      const rich = await setup({ parentFunds: 30000 });
      expect(
        (await runJob(rich.parent, 'reminders', eveOfPayDay).expect(200)).body
          .data.processed,
      ).toBe(0);
    }, 60_000);

    it('the dev jobs route needs the admin key, a known job, and only touches the caller’s own family', async () => {
      const { parent } = await setup({ parentFunds: 50000 });
      const other = await setup({ parentFunds: 50000 });
      await request(http())
        .post('/dev/allowance/jobs/payouts/run')
        .set(parent.auth)
        .send({ asOf: payDay })
        .expect(401);
      await adminPost('/dev/allowance/jobs/nope/run', parent)
        .send({})
        .expect(400);
      await adminPost('/dev/allowance/jobs/payouts/run', parent)
        .send({ asOf: 'not-a-date' })
        .expect(400);
      expect(
        (await runJob(parent, 'payouts', payDay).expect(200)).body.data
          .processed,
      ).toBe(1);
      // The other family was not touched by the first parent's run.
      expect(await parentBalance(other.parent)).toBe(50000);
    }, 60_000);
  });

  // ───────────── US5: the child asks for more money ─────────────
  describe('US5: requests for more money', () => {
    const adminPost = (path: string, user: TestUser) =>
      request(http())
        .post(path)
        .set(user.auth)
        .set('x-admin-key', TEST_ADMIN_KEY);
    const ask = (
      u: TestUser,
      body: object = { amountHalalas: 5000, reason: 'food', source: 'watch' },
    ) => request(http()).post('/allowance-requests').set(u.auth).send(body);
    const approve = (u: TestUser, id: string, body: object) =>
      request(http())
        .post(`/allowance-requests/${id}/approve`)
        .set(u.auth)
        .send(body);
    const summary = async (u: TestUser, childId?: string) =>
      (
        await request(http())
          .get(
            childId
              ? `/allowance/children/${childId}/summary`
              : '/allowance/me/summary',
          )
          .set(u.auth)
          .expect(200)
      ).body.data;
    const parentBalance = async (p: TestUser) =>
      (await request(http()).get('/wallet/me').set(p.auth)).body.data
        .balanceHalalas as number;

    async function setup(parentFunds = 20000, daily = 4000) {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      if (parentFunds > 0) {
        await adminPost('/dev/wallet/simulate/top-up', parent)
          .set('Idempotency-Key', randomUUID())
          .send({ amountHalalas: parentFunds })
          .expect(200);
      }
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send({
          ...settingsBody,
          monthlyAmountHalalas: 0,
          dailyLimitHalalas: daily,
          perPurchaseMaxHalalas: Math.min(3000, daily),
        })
        .expect(200);
      return { parent, child };
    }

    it('US5-1: the request needs no typing, the parent gets the event and an actionable push even with purchase notifications off', async () => {
      const { parent, child } = await setup();
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send({ ...settingsBody, purchaseNotifications: false })
        .expect(200);
      emitted = [];
      pushSpy.mockClear();
      const res = await ask(child).expect(200);
      expect(res.body.data).toMatchObject({
        childId: child.id,
        childName: 'Sara',
        amountHalalas: 5000,
        currency: 'SAR',
        reason: 'food',
        source: 'watch',
        status: 'pending',
        approvedAmountHalalas: null,
        parentNote: null,
        exceedsPerPurchaseMax: true,
      });
      expect(emitted).toContainEqual(
        expect.objectContaining({
          userId: parent.id,
          event: 'allowanceRequestCreated',
        }),
      );
      const push = pushSpy.mock.calls.find(
        (c) =>
          c[0] === parent.id &&
          (c[1] as { type: string }).type === 'allowance.requestCreated',
      );
      expect(push).toBeDefined();
      const message = push![1] as {
        apnsCategory: string;
        data: Record<string, string>;
        render: (l: 'en') => { body: string };
      };
      expect(message.apnsCategory).toBe('ALLOWANCE_REQUEST');
      expect(message.data).toMatchObject({
        childId: child.id,
        requestId: res.body.data.id,
      });
      expect(message.render('en').body).toBe(
        'Sara is asking for 50.00 SAR for food',
      );
      expect((await summary(child)).pendingRequest).toMatchObject({
        id: res.body.data.id,
      });
      const inbox = (
        await request(http())
          .get('/allowance-requests?status=pending')
          .set(parent.auth)
          .expect(200)
      ).body.data.items;
      expect(inbox.map((r: any) => r.id)).toEqual([res.body.data.id]);
    }, 60_000);

    it('US5-2: a second request → 409 REQUEST_ALREADY_PENDING with the pending one in data', async () => {
      const { child } = await setup();
      const first = (await ask(child).expect(200)).body.data;
      const second = await ask(child, {
        amountHalalas: 1000,
        reason: 'school',
        source: 'phone',
      }).expect(409);
      expect(second.body).toMatchObject({
        error: 'REQUEST_ALREADY_PENDING',
        data: { pending: { id: first.id, amountHalalas: 5000 } },
      });
    }, 60_000);

    it('validates the amount, reason and source', async () => {
      const { child } = await setup();
      await ask(child, {
        amountHalalas: 0,
        reason: 'food',
        source: 'watch',
      }).expect(400);
      await ask(child, {
        amountHalalas: 50001,
        reason: 'food',
        source: 'watch',
      }).expect(400);
      await ask(child, {
        amountHalalas: 10.5,
        reason: 'food',
        source: 'watch',
      }).expect(400);
      await ask(child, {
        amountHalalas: 1000,
        reason: 'toys',
        source: 'watch',
      }).expect(400);
      await ask(child, {
        amountHalalas: 1000,
        reason: 'food',
        source: 'tv',
      }).expect(400);
      const stranger = await createUser(t.app, 'Stranger');
      const notChild = await ask(stranger).expect(404);
      expect(notChild.body.error).toBe('NOT_A_LINKED_CHILD');
    }, 60_000);

    it('US5-3: approving 50.00 in full moves the money, and with a 40.00 daily limit today’s limit becomes 90.00', async () => {
      const { parent, child } = await setup(20000, 4000);
      const req = (await ask(child).expect(200)).body.data;
      pushSpy.mockClear();
      const res = await approve(parent, req.id, { amountHalalas: 5000 }).expect(
        200,
      );
      expect(res.body.data.request).toMatchObject({
        status: 'approved',
        approvedAmountHalalas: 5000,
      });
      expect(res.body.data.summary).toMatchObject({
        balanceHalalas: 5000,
        effectiveDailyLimitHalalas: 9000,
        pendingRequest: null,
      });
      expect(res.body.data.summary.limits.dailyLimitHalalas).toBe(4000);
      expect(await parentBalance(parent)).toBe(15000);
      const toChild = pushSpy.mock.calls.find(
        (c) =>
          c[0] === child.id &&
          (c[1] as { type: string }).type === 'allowance.requestResolved',
      );
      expect(
        (toChild![1] as { render: (l: 'en') => { body: string } }).render('en')
          .body,
      ).toBe('You got 50.00 SAR.');
      const items = (
        await request(http()).get('/allowance/me/transactions').set(child.auth)
      ).body.data.items;
      expect(items[0]).toMatchObject({
        kind: 'request_approved',
        direction: 'in',
        amountHalalas: 5000,
        requestId: req.id,
      });
    }, 60_000);

    it('US5-4: a partial approval with a note moves only that amount; the child sees both', async () => {
      const { parent, child } = await setup(20000, 4000);
      const req = (await ask(child).expect(200)).body.data;
      const res = await approve(parent, req.id, {
        amountHalalas: 2000,
        note: 'Use it for lunch',
      }).expect(200);
      expect(res.body.data.request).toMatchObject({
        status: 'partially_approved',
        approvedAmountHalalas: 2000,
        parentNote: 'Use it for lunch',
      });
      expect(res.body.data.summary).toMatchObject({
        balanceHalalas: 2000,
        effectiveDailyLimitHalalas: 6000,
      });
      expect((await summary(child)).lastResolvedRequest).toMatchObject({
        status: 'partially_approved',
        parentNote: 'Use it for lunch',
      });
      expect(await parentBalance(parent)).toBe(18000);
    }, 60_000);

    it('rejects approved amounts outside (0, requested] and notes over 140 characters', async () => {
      const { parent, child } = await setup();
      const req = (await ask(child).expect(200)).body.data;
      expect(
        (await approve(parent, req.id, { amountHalalas: 5001 }).expect(400))
          .body.error,
      ).toBe('APPROVED_AMOUNT_INVALID');
      await approve(parent, req.id, { amountHalalas: 0 }).expect(400);
      await approve(parent, req.id, {
        amountHalalas: 1000,
        note: 'x'.repeat(141),
      }).expect(400);
      const ok = await approve(parent, req.id, {
        amountHalalas: 1000,
        note: 'x'.repeat(140),
      }).expect(200);
      expect(ok.body.data.request.parentNote).toHaveLength(140);
    }, 60_000);

    it('US5-5: declining moves no money and tells the child (with the note)', async () => {
      const { parent, child } = await setup();
      const req = (await ask(child).expect(200)).body.data;
      pushSpy.mockClear();
      const res = await request(http())
        .post(`/allowance-requests/${req.id}/decline`)
        .set(parent.auth)
        .send({ note: 'Not today' })
        .expect(200);
      expect(res.body.data.request).toMatchObject({
        status: 'declined',
        parentNote: 'Not today',
      });
      expect(await parentBalance(parent)).toBe(20000);
      expect(await summary(child)).toMatchObject({
        balanceHalalas: 0,
        effectiveDailyLimitHalalas: 4000,
        pendingRequest: null,
      });
      const push = pushSpy.mock.calls.find(
        (c) =>
          c[0] === child.id &&
          (c[1] as { type: string }).type === 'allowance.requestResolved',
      );
      expect(
        (push![1] as { render: (l: 'en') => { body: string } }).render('en')
          .body,
      ).toBe('Your request wasn\'t approved. "Not today"');
      // The child can ask again.
      await ask(child).expect(200);
    }, 60_000);

    it('US5-6: the boost applies to the Ciro day of the approval only, and the next day it is gone while the money stays', async () => {
      const { parent, child } = await setup(20000, 4000);
      const req = (await ask(child).expect(200)).body.data;
      await approve(parent, req.id, { amountHalalas: 5000 }).expect(200);
      expect((await summary(child)).effectiveDailyLimitHalalas).toBe(9000);
      // "Tomorrow": the summary for the next Riyadh day sees no boost; today's boost doc is ignored.
      const tomorrow = new Date(
        Date.now() + 24 * 3600 * 1000 + 3 * 3600 * 1000,
      );
      const next = await t.app
        .get(ChildSummaryService)
        .getSummary(child.id, tomorrow);
      expect(next).toMatchObject({
        effectiveDailyLimitHalalas: 4000,
        balanceHalalas: 5000,
      });
    }, 60_000);

    it('US5-7: too little in the parent’s wallet fails clearly and the request stays pending', async () => {
      const { parent, child } = await setup(1000);
      const req = (await ask(child).expect(200)).body.data;
      const res = await approve(parent, req.id, { amountHalalas: 5000 }).expect(
        409,
      );
      expect(res.body.error).toBe('INSUFFICIENT_FUNDS');
      expect(await parentBalance(parent)).toBe(1000);
      expect((await summary(child)).pendingRequest).toMatchObject({
        id: req.id,
        status: 'pending',
      });
      expect((await summary(child)).effectiveDailyLimitHalalas).toBe(4000);
      // After funding, the same request can still be approved.
      await adminPost('/dev/wallet/simulate/top-up', parent)
        .set('Idempotency-Key', randomUUID())
        .send({ amountHalalas: 9000 })
        .expect(200);
      await approve(parent, req.id, { amountHalalas: 5000 }).expect(200);
    }, 60_000);

    it('two concurrent approvals → exactly one 200 and one 409 with the current request; money moves once', async () => {
      for (let round = 0; round < 3; round++) {
        const { parent, child } = await setup(20000, 4000);
        const req = (await ask(child).expect(200)).body.data;
        const [a, b] = await Promise.all([
          approve(parent, req.id, { amountHalalas: 5000 }),
          approve(parent, req.id, { amountHalalas: 5000 }),
        ]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        const loser = a.status === 409 ? a : b;
        expect(loser.body).toMatchObject({
          error: 'REQUEST_ALREADY_RESOLVED',
          data: { request: { id: req.id, status: 'approved' } },
        });
        expect(await parentBalance(parent)).toBe(15000);
        expect((await summary(child)).balanceHalalas).toBe(5000);
      }
    }, 120_000);

    it('an approval and a decline at the same time → one wins, the other is told the current state', async () => {
      const { parent, child } = await setup();
      const req = (await ask(child).expect(200)).body.data;
      const [a, d] = await Promise.all([
        approve(parent, req.id, { amountHalalas: 5000 }),
        request(http())
          .post(`/allowance-requests/${req.id}/decline`)
          .set(parent.auth)
          .send({}),
      ]);
      expect([a.status, d.status].sort()).toEqual([200, 409]);
      const finalStatus = (await summary(child)).lastResolvedRequest.status;
      expect(finalStatus).toBe(a.status === 200 ? 'approved' : 'declined');
      expect(await parentBalance(parent)).toBe(
        a.status === 200 ? 15000 : 20000,
      );
    }, 60_000);

    it('US5-8: an unanswered request expires after 24 h, the child is told and can ask again', async () => {
      const { parent, child } = await setup();
      const req = (await ask(child).expect(200)).body.data;
      pushSpy.mockClear();
      const early = await adminPost(
        '/dev/allowance/jobs/request-expiry/run',
        parent,
      )
        .send({ asOf: new Date().toISOString() })
        .expect(200);
      expect(early.body.data.processed).toBe(0);
      const later = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
      const late = await adminPost(
        '/dev/allowance/jobs/request-expiry/run',
        parent,
      )
        .send({ asOf: later })
        .expect(200);
      expect(late.body.data.processed).toBe(1);
      expect(
        pushSpy.mock.calls.some(
          (c) =>
            c[0] === child.id &&
            (c[1] as { type: string }).type === 'allowance.requestExpired',
        ),
      ).toBe(true);
      const mine = (
        await request(http())
          .get('/allowance-requests/me')
          .set(child.auth)
          .expect(200)
      ).body.data.items;
      expect(mine[0]).toMatchObject({ id: req.id, status: 'expired' });
      const items = (
        await request(http()).get('/allowance/me/transactions').set(child.auth)
      ).body.data.items;
      expect(items[0]).toMatchObject({
        kind: 'request_expired',
        direction: 'none',
      });
      await ask(child).expect(200);
      // An answer after expiry is refused.
      expect(
        (await approve(parent, req.id, { amountHalalas: 5000 }).expect(409))
          .body.error,
      ).toBe('REQUEST_ALREADY_RESOLVED');
    }, 60_000);

    it('the child can cancel their own request; nobody else can', async () => {
      const { parent, child } = await setup();
      const stranger = await createUser(t.app, 'Stranger');
      const req = (await ask(child).expect(200)).body.data;
      await request(http())
        .post(`/allowance-requests/${req.id}/cancel`)
        .set(parent.auth)
        .expect(404);
      await request(http())
        .post(`/allowance-requests/${req.id}/cancel`)
        .set(stranger.auth)
        .expect(404);
      const res = await request(http())
        .post(`/allowance-requests/${req.id}/cancel`)
        .set(child.auth)
        .expect(200);
      expect(res.body.data.status).toBe('cancelled');
      const again = await request(http())
        .post(`/allowance-requests/${req.id}/cancel`)
        .set(child.auth)
        .expect(409);
      expect(again.body.error).toBe('REQUEST_ALREADY_RESOLVED');
    }, 60_000);

    it('strangers and the child cannot answer requests; the parent’s inbox lists resolved ones too', async () => {
      const { parent, child } = await setup();
      const stranger = await createUser(t.app, 'Stranger');
      const req = (await ask(child).expect(200)).body.data;
      await approve(stranger, req.id, { amountHalalas: 1000 }).expect(404);
      await approve(child, req.id, { amountHalalas: 1000 }).expect(404);
      await request(http())
        .post(`/allowance-requests/${req.id}/decline`)
        .set(stranger.auth)
        .send({})
        .expect(404);
      await request(http())
        .post(`/allowance-requests/${new Types.ObjectId().toString()}/decline`)
        .set(parent.auth)
        .send({})
        .expect(404);
      await request(http())
        .post(`/allowance-requests/${req.id}/decline`)
        .set(parent.auth)
        .send({})
        .expect(200);
      const resolved = (
        await request(http())
          .get('/allowance-requests?status=resolved')
          .set(parent.auth)
          .expect(200)
      ).body.data.items;
      expect(resolved.map((r: any) => r.status)).toEqual(['declined']);
      expect(
        (
          await request(http())
            .get('/allowance-requests?status=pending')
            .set(parent.auth)
        ).body.data.items,
      ).toEqual([]);
    }, 60_000);

    it('lets a paused card still receive an approval (pausing does not cancel a request)', async () => {
      const { parent, child } = await setup();
      const req = (await ask(child).expect(200)).body.data;
      await request(http())
        .post(`/cards/children/${child.id}/pause`)
        .set(parent.auth)
        .expect(200);
      expect((await summary(child)).pendingRequest).toMatchObject({
        id: req.id,
      });
      await approve(parent, req.id, { amountHalalas: 5000 }).expect(200);
      expect((await summary(child)).cardStatus).toBe('paused');
    }, 60_000);
  });

  // ───────────── US7: parent monitoring and purchase notifications ─────────────
  describe('US7: parent monitoring', () => {
    const adminPost = (path: string, user: TestUser) =>
      request(http())
        .post(path)
        .set(user.auth)
        .set('x-admin-key', TEST_ADMIN_KEY);

    async function setup(purchaseNotifications: boolean, funds = 20000) {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send({
          ...settingsBody,
          monthlyAmountHalalas: 0,
          dailyLimitHalalas: 5000,
          perPurchaseMaxHalalas: 3000,
          purchaseNotifications,
        })
        .expect(200);
      const account = (await wallet.findChildAccount(child.id))!;
      const from = await wallet.getSystemAccount('simulation_funding');
      await wallet.runInTransaction((sx) =>
        wallet.transfer(
          {
            type: EntryType.SIMULATED_FUNDING,
            fromAccountId: from,
            toAccountId: account._id,
            amountHalalas: funds,
            idempotencyKey: `seed:${randomUUID()}`,
            initiator: { kind: 'simulation' },
          },
          sx,
        ),
      );
      return { parent, child };
    }
    const buy = (
      child: TestUser,
      amount: number,
      merchant = 'School canteen',
    ) =>
      adminPost('/dev/cards/simulate/purchase', child).send({
        merchantName: merchant,
        category: 'food_dining',
        amountHalalas: amount,
      });
    const toParent = (parent: TestUser) =>
      pushSpy.mock.calls.filter(
        (c) =>
          c[0] === parent.id &&
          (c[1] as { type: string }).type === 'allowance.purchase',
      );

    it('notifications on → the parent hears about approved and declined purchases', async () => {
      const { parent, child } = await setup(true);
      pushSpy.mockClear();
      await buy(child, 2500).expect(200);
      await buy(child, 3001, 'Toy Store').expect(200);
      const sent = toParent(parent);
      expect(sent).toHaveLength(2);
      const bodies = sent.map(
        (c) =>
          (c[1] as { render: (l: 'en') => { body: string } }).render('en').body,
      );
      expect(bodies).toEqual([
        'Sara spent 25.00 SAR at School canteen',
        "Sara's 30.01 SAR purchase was declined: Over per-purchase limit",
      ]);
    }, 60_000);

    it('notifications off → no push, but the rows are still in the activity list; a request still notifies (US7-5)', async () => {
      const { parent, child } = await setup(false);
      pushSpy.mockClear();
      await buy(child, 2500).expect(200);
      await buy(child, 3001, 'Toy Store').expect(200);
      expect(toParent(parent)).toHaveLength(0);
      const items = (
        await request(http())
          .get(`/allowance/children/${child.id}/transactions`)
          .set(parent.auth)
          .expect(200)
      ).body.data.items;
      expect(items.map((i: any) => i.kind)).toEqual([
        'purchase_declined',
        'purchase',
      ]);

      await request(http())
        .post('/allowance-requests')
        .set(child.auth)
        .send({ amountHalalas: 1000, reason: 'school', source: 'phone' })
        .expect(200);
      expect(
        pushSpy.mock.calls.some(
          (c) =>
            c[0] === parent.id &&
            (c[1] as { type: string }).type === 'allowance.requestCreated',
        ),
      ).toBe(true);
    }, 60_000);

    it('turning notifications off for one child silences only that child (per-child preference)', async () => {
      const parent = await createUser(t.app, 'Mama');
      const quiet = await createUser(t.app, 'Quiet');
      const loud = await createUser(t.app, 'Loud');
      for (const [kid, notify] of [
        [quiet, false],
        [loud, true],
      ] as const) {
        await link(parent, kid);
        await request(http())
          .put(`/allowance/children/${kid.id}/settings`)
          .set(parent.auth)
          .send({
            ...settingsBody,
            monthlyAmountHalalas: 0,
            purchaseNotifications: notify,
          })
          .expect(200);
        const account = (await wallet.findChildAccount(kid.id))!;
        const from = await wallet.getSystemAccount('simulation_funding');
        await wallet.runInTransaction((sx) =>
          wallet.transfer(
            {
              type: EntryType.SIMULATED_FUNDING,
              fromAccountId: from,
              toAccountId: account._id,
              amountHalalas: 10000,
              idempotencyKey: `seed:${randomUUID()}`,
              initiator: { kind: 'simulation' },
            },
            sx,
          ),
        );
      }
      pushSpy.mockClear();
      await buy(quiet, 1000).expect(200);
      await buy(loud, 1000).expect(200);
      const sent = toParent(parent);
      expect(sent).toHaveLength(1);
      expect(
        (sent[0][1] as { data: Record<string, string> }).data.childId,
      ).toBe(loud.id);
    }, 90_000);

    it('US7-1/2: per-child figures and the full list, with refunds netted into this month’s spending', async () => {
      const { parent, child } = await setup(true);
      const first = (await buy(child, 2500).expect(200)).body.data;
      await buy(child, 1000).expect(200);
      await adminPost('/dev/cards/simulate/refund', child)
        .send({
          originalTransactionId: first.transactionId,
          amountHalalas: 500,
        })
        .expect(200);
      const s = (
        await request(http())
          .get(`/allowance/children/${child.id}/summary`)
          .set(parent.auth)
          .expect(200)
      ).body.data;
      expect(s).toMatchObject({
        balanceHalalas: 20000 - 2500 - 1000 + 500,
        spentTodayHalalas: 3000,
        spentThisMonthHalalas: 3000,
        availableTodayHalalas: 2000,
        cardStatus: 'active',
        pendingRequest: null,
      });
      const list = (
        await request(http()).get('/family/me').set(parent.auth).expect(200)
      ).body.data.children[0];
      expect(list).toMatchObject({
        childId: child.id,
        balanceHalalas: 17000,
        spentTodayHalalas: 3000,
        cardStatus: 'active',
        hasPendingRequest: false,
      });
      const items = (
        await request(http())
          .get(`/allowance/children/${child.id}/transactions`)
          .set(parent.auth)
      ).body.data.items;
      expect(items.map((i: any) => i.kind)).toEqual([
        'refund',
        'purchase',
        'purchase',
      ]);
    }, 60_000);
  });

  // ───────────── US8: the parent unlinks a child ─────────────
  describe('US8: unlink', () => {
    const adminPost = (path: string, user: TestUser) =>
      request(http())
        .post(path)
        .set(user.auth)
        .set('x-admin-key', TEST_ADMIN_KEY);
    const events_ = () => t.app.get(CardEventsService);

    async function setup(childFunds: number) {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send({
          ...settingsBody,
          monthlyAmountHalalas: 0,
          dailyLimitHalalas: 9000,
          perPurchaseMaxHalalas: 3000,
        })
        .expect(200);
      const account = (await wallet.findChildAccount(child.id))!;
      if (childFunds > 0) {
        const from = await wallet.getSystemAccount('simulation_funding');
        await wallet.runInTransaction((sx) =>
          wallet.transfer(
            {
              type: EntryType.SIMULATED_FUNDING,
              fromAccountId: from,
              toAccountId: account._id,
              amountHalalas: childFunds,
              idempotencyKey: `seed:${randomUUID()}`,
              initiator: { kind: 'simulation' },
            },
            sx,
          ),
        );
      }
      return { parent, child, accountId: account._id };
    }
    const parentBalance = async (p: TestUser) =>
      (await request(http()).get('/wallet/me').set(p.auth)).body.data
        .balanceHalalas as number;
    const unlink = (parent: TestUser, childId: string) =>
      request(http()).delete(`/family/children/${childId}`).set(parent.auth);

    it('US8-1/2: returns the whole balance, cancels the pending request, deactivates the card, and the child leaves the allowance view', async () => {
      const { parent, child } = await setup(4550);
      const req = (
        await request(http())
          .post('/allowance-requests')
          .set(child.auth)
          .send({ amountHalalas: 5000, reason: 'food', source: 'phone' })
          .expect(200)
      ).body.data;
      emitted = [];
      pushSpy.mockClear();

      const res = await unlink(parent, child.id).expect(200);
      expect(res.body.data).toEqual({ returnedHalalas: 4550, currency: 'SAR' });
      expect(await parentBalance(parent)).toBe(4550);

      const mine = (
        await request(http())
          .get('/allowance-requests/me')
          .set(child.auth)
          .expect(404)
      ).body;
      expect(mine.error).toBe('NOT_A_LINKED_CHILD');
      expect(
        emitted
          .filter(
            (e) =>
              e.event === 'allowanceUpdated' &&
              e.payload.reason === 'unlinked' &&
              e.payload.summary === null,
          )
          .map((e) => e.userId)
          .sort(),
      ).toEqual([child.id, parent.id].sort());
      expect(
        emitted.some(
          (e) =>
            e.event === 'allowanceRequestResolved' &&
            e.payload.request.id === req.id &&
            e.payload.request.status === 'cancelled',
        ),
      ).toBe(true);
      expect(
        pushSpy.mock.calls.some(
          (c) =>
            c[0] === child.id &&
            (c[1] as { type: string }).type === 'allowance.unlinked',
        ),
      ).toBe(true);

      expect(
        (await request(http()).get('/family/me').set(child.auth).expect(200))
          .body.data,
      ).toEqual({ role: 'none', parent: null, children: [] });
      expect(
        (await request(http()).get('/family/me').set(parent.auth).expect(200))
          .body.data.role,
      ).toBe('none');
      const models = {
        card: t.app.get<Model<CardDocument>>(getModelToken(Card.name)),
        request: t.app.get<Model<AllowanceRequestDocument>>(
          getModelToken(AllowanceRequest.name),
        ),
        accounts: t.app.get<Model<LedgerAccountDocument>>(
          getModelToken(LedgerAccount.name),
        ),
      };
      expect(
        (
          await models.card.findOne({
            childUserId: new Types.ObjectId(child.id),
          })
        )?.status,
      ).toBe('inactive');
      expect((await models.request.findById(req.id))?.status).toBe('cancelled');
      expect(
        (
          await models.accounts.findOne({
            kind: 'user_wallet',
            ownerUserId: new Types.ObjectId(child.id),
          })
        )?.frozen,
      ).toBe(false);
    }, 60_000);

    it('a zero balance posts no return entry', async () => {
      const { parent, child } = await setup(0);
      const res = await unlink(parent, child.id).expect(200);
      expect(res.body.data.returnedHalalas).toBe(0);
      const entries = t.app.get<Model<any>>(getModelToken(LedgerEntry.name));
      expect(
        await entries.countDocuments({
          type: EntryType.UNLINK_RETURN,
          'initiator.userId': new Types.ObjectId(parent.id),
        }),
      ).toBeGreaterThanOrEqual(0);
      expect(await parentBalance(parent)).toBe(0);
    }, 60_000);

    it('the former parent gets 404 on every child route, and the child on every allowance route', async () => {
      const { parent, child } = await setup(1000);
      await unlink(parent, child.id).expect(200);
      await request(http())
        .get(`/allowance/children/${child.id}/summary`)
        .set(parent.auth)
        .expect(404);
      await request(http())
        .get(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .expect(404);
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(parent.auth)
        .send(settingsBody)
        .expect(404);
      await request(http())
        .get(`/allowance/children/${child.id}/transactions`)
        .set(parent.auth)
        .expect(404);
      await request(http())
        .post(`/cards/children/${child.id}/pause`)
        .set(parent.auth)
        .expect(404);
      await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(parent.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ amountHalalas: 100 })
        .expect(404);
      await unlink(parent, child.id).expect(404);
      await request(http())
        .get('/allowance/me/summary')
        .set(child.auth)
        .expect(404);
      await request(http()).get('/cards/me').set(child.auth).expect(404);
    }, 60_000);

    it('a stranger and the child cannot unlink', async () => {
      const { child } = await setup(1000);
      const stranger = await createUser(t.app, 'Stranger');
      await unlink(stranger, child.id).expect(404);
      await unlink(child, child.id).expect(404);
    }, 60_000);

    it('a purchase after unlinking is declined CARD_INACTIVE and nobody is notified', async () => {
      const { parent, child } = await setup(5000);
      const card = (await t.app
        .get<Model<CardDocument>>(getModelToken(Card.name))
        .findOne({ childUserId: new Types.ObjectId(child.id) }))!;
      await unlink(parent, child.id).expect(200);
      pushSpy.mockClear();
      const out = await events_().handle(
        {
          kind: 'authorization_request',
          issuerTxnId: `sim_${randomUUID()}`,
          cardRef: card.cardRef,
          amountHalalas: 500,
          merchantName: 'Cafe',
          category: 'food_dining',
          occurredAt: new Date(),
        },
        'simulation',
      );
      expect(out.result).toMatchObject({
        outcome: 'declined',
        declineReason: 'CARD_INACTIVE',
      });
      expect(
        pushSpy.mock.calls.filter((c) =>
          (c[1] as { type: string }).type.startsWith('allowance.purchase'),
        ),
      ).toHaveLength(0);
    }, 60_000);

    it('a refund after unlinking goes to the former parent’s wallet', async () => {
      const { parent, child } = await setup(10000);
      const bought = (
        await adminPost('/dev/cards/simulate/purchase', child)
          .send({
            merchantName: 'Cafe',
            category: 'food_dining',
            amountHalalas: 2500,
          })
          .expect(200)
      ).body.data;
      await unlink(parent, child.id).expect(200);
      expect(await parentBalance(parent)).toBe(7500);
      const card = (await t.app
        .get<Model<CardDocument>>(getModelToken(Card.name))
        .findOne({ childUserId: new Types.ObjectId(child.id) }))!;
      const tx = (await t.app
        .get<
          Model<CardTransactionDocument>
        >(getModelToken(CardTransaction.name))
        .findById(bought.transactionId))!;
      const out = await events_().handle(
        {
          kind: 'refund',
          issuerTxnId: `sim_${randomUUID()}`,
          cardRef: card.cardRef,
          originalIssuerTxnId: tx.issuerTxnId,
          amountHalalas: 2500,
          merchantName: 'Cafe',
          occurredAt: new Date(),
        },
        'simulation',
      );
      expect(out.result).toMatchObject({ creditedTo: 'former_parent' });
      expect(await parentBalance(parent)).toBe(10000);
    }, 60_000);

    it('every earlier ledger entry is unchanged; unlinking only adds one', async () => {
      const { parent, child } = await setup(6000);
      await adminPost('/dev/cards/simulate/purchase', child)
        .send({
          merchantName: 'Cafe',
          category: 'food_dining',
          amountHalalas: 1500,
        })
        .expect(200);
      const entries = t.app.get<Model<any>>(getModelToken(LedgerEntry.name));
      const before = await entries.find({}).sort({ _id: 1 }).lean();
      await unlink(parent, child.id).expect(200);
      const after = await entries.find({}).sort({ _id: 1 }).lean();
      expect(after.length).toBe(before.length + 1);
      expect(after.slice(0, before.length)).toEqual(before);
      expect(after[after.length - 1]).toMatchObject({
        type: EntryType.UNLINK_RETURN,
        amountHalalas: 4500,
      });
    }, 60_000);

    it('the child can be linked again with a new code, starting from 0.00 with a fresh card', async () => {
      const { parent, child } = await setup(3000);
      await unlink(parent, child.id).expect(200);
      const again = await link(parent, child);
      expect(again.child).toMatchObject({
        childId: child.id,
        balanceHalalas: 0,
        cardStatus: 'active',
      });
      const me = (
        await request(http()).get('/family/me').set(child.auth).expect(200)
      ).body.data;
      expect(me.role).toBe('child');
      const accounts = t.app.get<Model<LedgerAccountDocument>>(
        getModelToken(LedgerAccount.name),
      );
      expect(
        (
          await accounts.findOne({
            kind: 'user_wallet',
            ownerUserId: new Types.ObjectId(child.id),
          })
        )?.frozen,
      ).toBe(true);
      // The old activity is not shown under the new link.
      const items = (
        await request(http())
          .get('/allowance/me/transactions')
          .set(child.auth)
          .expect(200)
      ).body.data.items;
      expect(items).toEqual([]);
    }, 60_000);

    it('revokes the watch session and deletes the child’s watch push tokens', async () => {
      const { parent, child } = await setup(1000);
      const session = (
        await request(http())
          .post('/auth/device-sessions')
          .set(child.auth)
          .send({ deviceType: 'watch' })
          .expect(200)
      ).body.data;
      const watchAuth = { Authorization: `Bearer ${session.accessToken}` };
      await request(http())
        .post('/auth/device-token')
        .set(watchAuth)
        .send({ token: 'a'.repeat(64), platform: 'apns-watch', locale: 'ar' })
        .expect(204);
      const tokens = t.app.get<Model<any>>(getModelToken(DeviceToken.name));
      expect(
        await tokens.countDocuments({
          userId: new Types.ObjectId(child.id),
          platform: 'apns-watch',
        }),
      ).toBe(1);
      await request(http())
        .get('/allowance/me/summary')
        .set(watchAuth)
        .expect(200);

      await unlink(parent, child.id).expect(200);

      expect(
        await tokens.countDocuments({
          userId: new Types.ObjectId(child.id),
          platform: 'apns-watch',
        }),
      ).toBe(0);
      await request(http())
        .get('/allowance/me/summary')
        .set(watchAuth)
        .expect(401); // session revoked: dies at once
      const refresh = await request(http())
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(refresh.body.message).toBe('Refresh token revoked');
    }, 60_000);
  });

  // ───────────── Security (quickstart §2) ─────────────
  describe('Security', () => {
    const adminPost = (path: string, user: TestUser) =>
      request(http())
        .post(path)
        .set(user.auth)
        .set('x-admin-key', TEST_ADMIN_KEY);

    async function linked() {
      const parent = await createUser(t.app, 'Mama');
      const child = await createUser(t.app, 'Sara');
      await link(parent, child);
      return { parent, child };
    }

    it('every new route needs a JWT (401 without one)', async () => {
      const id = new Types.ObjectId().toString();
      const routes: [string, string][] = [
        ['get', '/wallet/me'],
        ['get', '/family/me'],
        ['post', '/family/link-codes'],
        ['get', '/family/link-codes/current'],
        ['post', '/family/link-codes/claim'],
        ['post', '/family/link-codes/current/confirm'],
        ['delete', `/family/children/${id}`],
        ['get', '/allowance/me/summary'],
        ['get', '/allowance/me/settings'],
        ['get', '/allowance/me/transactions'],
        ['get', `/allowance/children/${id}/summary`],
        ['put', `/allowance/children/${id}/settings`],
        ['post', `/allowance/children/${id}/top-ups`],
        ['post', `/allowance/children/${id}/pull-backs`],
        ['post', `/allowance/children/${id}/payouts/${id}/pay`],
        ['get', '/cards/me'],
        ['get', `/cards/children/${id}`],
        ['post', `/cards/children/${id}/pause`],
        ['post', '/allowance-requests'],
        ['get', '/allowance-requests'],
        ['get', '/allowance-requests/me'],
        ['post', `/allowance-requests/${id}/approve`],
        ['post', `/allowance-requests/${id}/decline`],
        ['post', `/allowance-requests/${id}/cancel`],
        ['post', '/auth/device-sessions'],
        ['delete', '/auth/device-sessions/watch'],
      ];
      for (const [method, path] of routes) {
        const res = await (request(http()) as any)[method](path);
        expect([method, path, res.status]).toEqual([method, path, 401]);
      }
    }, 60_000);

    it('a stranger cannot read a child’s summary, settings, transactions or card (404, same as a missing child)', async () => {
      const { child } = await linked();
      const stranger = await createUser(t.app, 'Stranger');
      for (const path of [
        `/allowance/children/${child.id}/summary`,
        `/allowance/children/${child.id}/settings`,
        `/allowance/children/${child.id}/transactions`,
        `/cards/children/${child.id}`,
      ]) {
        const res = await request(http())
          .get(path)
          .set(stranger.auth)
          .expect(404);
        expect(res.body.error).toBe('CHILD_NOT_FOUND');
      }
    }, 60_000);

    it('a child cannot change settings, move money, pause the card or answer requests (404)', async () => {
      const { child } = await linked();
      const idem = randomUUID();
      await request(http())
        .put(`/allowance/children/${child.id}/settings`)
        .set(child.auth)
        .send(settingsBody)
        .expect(404);
      await request(http())
        .post(`/allowance/children/${child.id}/top-ups`)
        .set(child.auth)
        .set('Idempotency-Key', idem)
        .send({ amountHalalas: 100 })
        .expect(404);
      await request(http())
        .post(`/allowance/children/${child.id}/pull-backs`)
        .set(child.auth)
        .set('Idempotency-Key', idem)
        .send({ amountHalalas: 100 })
        .expect(404);
      await request(http())
        .post(`/cards/children/${child.id}/pause`)
        .set(child.auth)
        .expect(404);
      await request(http())
        .delete(`/family/children/${child.id}`)
        .set(child.auth)
        .expect(404);
    }, 60_000);

    it('/dev/* without the admin key → 401 on every dev route', async () => {
      const { parent, child } = await linked();
      const id = new Types.ObjectId().toString();
      const calls: [string, TestUser, object][] = [
        ['/dev/wallet/simulate/top-up', parent, { amountHalalas: 100 }],
        ['/dev/wallet/reconciliation/run', parent, {}],
        [
          '/dev/cards/simulate/purchase',
          child,
          { merchantName: 'x', category: 'food_dining', amountHalalas: 100 },
        ],
        [
          '/dev/cards/simulate/refund',
          child,
          { originalTransactionId: id, amountHalalas: 100 },
        ],
        ['/dev/allowance/jobs/payouts/run', parent, {}],
      ];
      for (const [path, user, body] of calls) {
        await request(http())
          .post(path)
          .set(user.auth)
          .set('Idempotency-Key', randomUUID())
          .send(body)
          .expect(401);
        await request(http())
          .post(path)
          .set(user.auth)
          .set('x-admin-key', 'wrong')
          .set('Idempotency-Key', randomUUID())
          .send(body)
          .expect(401);
      }
    }, 60_000);

    it('with NODE_ENV=production the dev routes answer 404 even with a valid admin key', async () => {
      const { parent } = await linked();
      const before = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await adminPost('/dev/wallet/simulate/top-up', parent)
          .set('Idempotency-Key', randomUUID())
          .send({ amountHalalas: 100 })
          .expect(404);
        await adminPost('/dev/allowance/jobs/payouts/run', parent)
          .send({})
          .expect(404);
      } finally {
        process.env.NODE_ENV = before;
      }
    }, 60_000);

    it('a refresh token is rejected as a bearer token (F5); the access token from the same login works', async () => {
      const user = await createUser(t.app, 'Otp User');
      await request(http())
        .post('/auth/send-otp')
        .send({ phoneNumber: user.phoneNumber })
        .expect(200);
      const login = (
        await request(http())
          .post('/auth/verify-otp')
          .send({ phoneNumber: user.phoneNumber, code: '123456' })
          .expect(200)
      ).body.data;
      await request(http())
        .get('/family/me')
        .set('Authorization', `Bearer ${login.accessToken}`)
        .expect(200);
      await request(http())
        .get('/family/me')
        .set('Authorization', `Bearer ${login.refreshToken}`)
        .expect(401);
      // And the refresh token still does its own job.
      const refreshed = await request(http())
        .post('/auth/refresh')
        .send({ refreshToken: login.refreshToken })
        .expect(200);
      expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
    }, 60_000);

    it('a watch session is its own: refreshing it does not log the phone out, and revoking it kills it', async () => {
      const { parent, child } = await linked();
      void parent;
      const session = (
        await request(http())
          .post('/auth/device-sessions')
          .set(child.auth)
          .send({ deviceType: 'watch' })
          .expect(200)
      ).body.data;
      expect(session).toMatchObject({
        sessionId: expect.any(String),
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      await request(http())
        .post('/auth/device-sessions')
        .set(child.auth)
        .send({ deviceType: 'tv' })
        .expect(400);

      const first = (
        await request(http())
          .post('/auth/refresh')
          .send({ refreshToken: session.refreshToken })
          .expect(200)
      ).body.data;
      expect(first.refreshToken).not.toBe(session.refreshToken);
      // The old watch token is revoked once rotated.
      expect(
        (
          await request(http())
            .post('/auth/refresh')
            .send({ refreshToken: session.refreshToken })
            .expect(401)
        ).body.message,
      ).toBe('Refresh token revoked');
      // The phone's own token was never touched: its access token still works.
      await request(http()).get('/family/me').set(child.auth).expect(200);

      await request(http())
        .delete('/auth/device-sessions/watch')
        .set(child.auth)
        .expect(204);
      await request(http())
        .delete('/auth/device-sessions/watch')
        .set(child.auth)
        .expect(204); // idempotent
      await request(http())
        .get('/family/me')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(401);
      expect(
        (
          await request(http())
            .post('/auth/refresh')
            .send({ refreshToken: first.refreshToken })
            .expect(401)
        ).body.message,
      ).toBe('Refresh token revoked');
    }, 60_000);

    it('only a linked child can get a watch session (403 WATCH_REQUIRES_LINKED_CHILD)', async () => {
      const nobody = await createUser(t.app, 'Nobody');
      const res = await request(http())
        .post('/auth/device-sessions')
        .set(nobody.auth)
        .send({ deviceType: 'watch' })
        .expect(403);
      expect(res.body.error).toBe('WATCH_REQUIRES_LINKED_CHILD');
      const { parent } = await linked();
      await request(http())
        .post('/auth/device-sessions')
        .set(parent.auth)
        .send({ deviceType: 'watch' })
        .expect(403);
    }, 60_000);

    it('with the ledger unavailable: money routes → 503 LEDGER_UNAVAILABLE, authorizations → SERVICE_UNAVAILABLE', async () => {
      const { parent, child } = await linked();
      const health = t.app.get(LedgerHealthService);
      health.setAvailable(false);
      try {
        const idem = randomUUID();
        const me = await request(http())
          .get('/wallet/me')
          .set(parent.auth)
          .expect(503);
        expect(me.body.error).toBe('LEDGER_UNAVAILABLE');
        for (const [path, body] of [
          [`/allowance/children/${child.id}/top-ups`, { amountHalalas: 100 }],
          [
            `/allowance/children/${child.id}/pull-backs`,
            { amountHalalas: 100 },
          ],
        ] as const) {
          const res = await request(http())
            .post(path)
            .set(parent.auth)
            .set('Idempotency-Key', idem)
            .send(body)
            .expect(503);
          expect(res.body.error).toBe('LEDGER_UNAVAILABLE');
        }
        expect(
          (
            await request(http())
              .put(`/allowance/children/${child.id}/settings`)
              .set(parent.auth)
              .send(settingsBody)
              .expect(503)
          ).body.error,
        ).toBe('LEDGER_UNAVAILABLE');
        expect(
          (
            await request(http())
              .delete(`/family/children/${child.id}`)
              .set(parent.auth)
              .expect(503)
          ).body.error,
        ).toBe('LEDGER_UNAVAILABLE');
        const buy = await adminPost('/dev/cards/simulate/purchase', child)
          .send({
            merchantName: 'Cafe',
            category: 'food_dining',
            amountHalalas: 100,
          })
          .expect(200);
        expect(buy.body.data).toMatchObject({
          outcome: 'declined',
          declineReason: 'SERVICE_UNAVAILABLE',
        });
        // Chat and reads that do not touch money keep working.
        await request(http()).get('/family/me').set(parent.auth).expect(200);
      } finally {
        health.setAvailable(true);
      }
      await request(http()).get('/wallet/me').set(parent.auth).expect(200);
    }, 60_000);

    it('reconciliation: the admin endpoint needs the admin key (no user token is enough), and a run is ok', async () => {
      const { parent } = await linked();
      await request(http()).get('/admin/ledger/reconciliation').expect(401);
      await request(http())
        .get('/admin/ledger/reconciliation')
        .set(parent.auth)
        .expect(401);
      await request(http())
        .get('/admin/ledger/reconciliation')
        .set('x-admin-key', 'wrong')
        .expect(401);

      const run = await adminPost('/dev/wallet/reconciliation/run', parent)
        .send({})
        .expect(200);
      expect(run.body.data).toEqual({
        reportId: expect.any(String),
        status: 'ok',
      });
      const reports = await request(http())
        .get('/admin/ledger/reconciliation?limit=5')
        .set('x-admin-key', TEST_ADMIN_KEY)
        .expect(200);
      expect(reports.body.data.items[0]).toMatchObject({
        id: run.body.data.reportId,
        status: 'ok',
        mismatches: [],
      });
      expect(
        reports.body.data.items[0].checks.map((c: any) => c.name),
      ).toContain('spend-counters');
    }, 60_000);

    it('reconciliation detects a tampered balance: status mismatch and exactly one alert', async () => {
      const { child } = await linked();
      const accounts = t.app.get<Model<LedgerAccountDocument>>(
        getModelToken(LedgerAccount.name),
      );
      const alert = jest
        .spyOn(t.app.get(OpsAlertService), 'alert')
        .mockResolvedValue(undefined);
      const recon = t.app.get(ReconciliationService);
      recon.recheckDelayMs = 10;
      await accounts.updateOne(
        { kind: 'child_balance', ownerUserId: new Types.ObjectId(child.id) },
        { $set: { balanceHalalas: 777 } },
      );
      try {
        const report = await recon.run();
        expect(report.status).toBe('mismatch');
        expect(report.mismatches).toHaveLength(1);
        expect(report.mismatches[0]).toMatchObject({
          cachedHalalas: 777,
          derivedHalalas: 0,
        });
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert).toHaveBeenCalledWith(
          'LEDGER_MISMATCH',
          expect.any(String),
          expect.anything(),
        );
      } finally {
        await accounts.updateOne(
          { kind: 'child_balance', ownerUserId: new Types.ObjectId(child.id) },
          { $set: { balanceHalalas: 0 } },
        );
        alert.mockRestore();
      }
      const clean = await recon.run();
      expect(clean.status).toBe('ok');
    }, 60_000);
  });

  // @@ENDBLOCKS@@
});
