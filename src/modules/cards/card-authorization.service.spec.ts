import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { CardAuthorizationService } from './card-authorization.service';
import { SpendCounterService } from '../family-core/spend-counter.service';
import { InsufficientBalanceError } from '../wallet/ledger.errors';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import { riyadhDate } from '../../common/utils/riyadh-time.util';
import { AuthorizationRequestEvent } from './issuer/issuer-provider';

/**
 * 026 (T118): the purchase path with mocked repositories. The spend counter
 * is the real one against live Redis (per-run key prefix) so the compensation
 * rules are tested on the real Lua scripts.
 */
describe('CardAuthorizationService (026, R3)', () => {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const prefix = `unit:auth:${randomBytes(6).toString('hex')}:`;
  let redis: Redis;

  const parentId = new Types.ObjectId();
  const linkId = new Types.ObjectId();
  const cardId = new Types.ObjectId();
  const accountId = new Types.ObjectId();
  const settlementId = new Types.ObjectId();
  const today = riyadhDate(new Date());
  const session = { id: 'session' };

  // A fresh child per test: reservations live in a shared Redis counter keyed by child.
  let childId: Types.ObjectId;
  let card: {
    _id: Types.ObjectId;
    childUserId: Types.ObjectId;
    linkId: Types.ObjectId;
    status: string;
    cardRef: string;
  };
  let link: {
    _id: Types.ObjectId;
    childUserId: Types.ObjectId;
    parentUserId: Types.ObjectId;
    childAccountId: Types.ObjectId;
    status: string;
    rev: number;
  };
  const settings = {
    dailyLimitHalalas: 5000,
    perPurchaseMaxHalalas: 3000,
    blockedCategories: [] as string[],
  };

  let cards: Record<string, jest.Mock>;
  let links: Record<string, jest.Mock>;
  let settingsRepo: Record<string, jest.Mock>;
  let boosts: Record<string, jest.Mock>;
  let txns: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let health: { ledgerAvailable: boolean };
  let events: Record<string, jest.Mock>;
  let spend: SpendCounterService;
  let service: CardAuthorizationService;
  let inserted: Record<string, unknown>[];
  let balance: number;

  const event = (
    over: Partial<AuthorizationRequestEvent> = {},
  ): AuthorizationRequestEvent => ({
    kind: 'authorization_request',
    issuerTxnId: `iss_${randomBytes(4).toString('hex')}`,
    cardRef: 'stub_1',
    amountHalalas: 2000,
    merchantName: 'Cafe',
    category: 'food_dining',
    occurredAt: new Date(),
    ...over,
  });

  beforeAll(() => {
    redis = new Redis(url, { keyPrefix: prefix });
  });

  afterAll(async () => {
    const raw = new Redis(url);
    const keys = await raw.keys(`${prefix}*`);
    if (keys.length) await raw.del(...keys);
    raw.disconnect();
    redis.disconnect();
  });

  beforeEach(() => {
    childId = new Types.ObjectId();
    card = {
      _id: cardId,
      childUserId: childId,
      linkId,
      status: 'active',
      cardRef: 'stub_1',
    };
    link = {
      _id: linkId,
      childUserId: childId,
      parentUserId: parentId,
      childAccountId: accountId,
      status: 'active',
      rev: 3,
    };
    inserted = [];
    balance = 10000;
    cards = { findByRef: jest.fn().mockResolvedValue(card) };
    links = {
      findById: jest.fn().mockResolvedValue(link),
      bumpRev: jest.fn().mockResolvedValue(4),
    };
    settingsRepo = {
      findByLinkId: jest
        .fn()
        .mockResolvedValue({ ...settings, purchaseNotifications: true }),
    };
    boosts = { amountFor: jest.fn().mockResolvedValue(0) };
    txns = {
      findByIssuerTxn: jest.fn().mockResolvedValue(null),
      findById: jest.fn((id: Types.ObjectId) =>
        Promise.resolve(
          inserted.find((d) => String(d._id) === String(id)) ?? null,
        ),
      ),
      insert: jest.fn((d: Record<string, unknown>) => {
        const doc = {
          createdAt: new Date(),
          ...d,
          _id: d._id ?? new Types.ObjectId(),
        };
        inserted.push(doc);
        return Promise.resolve(doc);
      }),
      setLedgerEntry: jest.fn().mockResolvedValue(undefined),
      setSettlement: jest.fn().mockResolvedValue(undefined),
      incRefunded: jest.fn().mockResolvedValue(true),
      sumApprovedOn: jest.fn().mockResolvedValue(0),
      sumSameDayReturnsOn: jest.fn().mockResolvedValue(0),
    };
    wallet = {
      getBalance: jest.fn(() => Promise.resolve(balance)),
      getSystemAccount: jest.fn().mockResolvedValue(settlementId),
      getOrCreateUserWallet: jest
        .fn()
        .mockResolvedValue({ _id: new Types.ObjectId() }),
      transfer: jest.fn().mockResolvedValue({
        entry: { _id: new Types.ObjectId() },
        replayed: false,
      }),
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
    };
    health = { ledgerAvailable: true };
    events = {
      summaryChanged: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };
    spend = new SpendCounterService(redis, txns as never);
    service = new CardAuthorizationService(
      cards as never,
      links as never,
      settingsRepo as never,
      boosts as never,
      txns as never,
      spend,
      wallet as never,
      health as never,
      events as never,
      { name: 'stub' } as never,
      { findById: jest.fn().mockResolvedValue({ name: 'Sara' }) } as never,
    );
  });

  describe('approval path', () => {
    it('records the approved transaction, posts one purchase entry and bumps rev in one transaction', async () => {
      const outcome = await service.authorize(
        event({ issuerTxnId: 'iss_ok' }),
        'simulation',
      );
      expect(outcome).toMatchObject({ outcome: 'approved' });
      expect(wallet.runInTransaction).toHaveBeenCalledTimes(1);
      expect(inserted[0]).toMatchObject({
        outcome: 'approved',
        kind: 'authorization',
        amountHalalas: 2000,
        settlement: 'authorized',
      });
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EntryType.PURCHASE,
          fromAccountId: accountId,
          toAccountId: settlementId,
          amountHalalas: 2000,
          idempotencyKey: 'card:stub:iss_ok',
        }),
        session,
      );
      expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
      expect(events.summaryChanged).toHaveBeenCalledWith(
        childId.toString(),
        'purchase',
        expect.anything(),
        link,
      );
    });

    it('does not notify the child of an approved purchase (US2-10)', async () => {
      await service.authorize(event(), 'simulation');
      expect(
        events.notify.mock.calls.filter((c) => c[0] === childId.toString()),
      ).toHaveLength(0);
    });

    it('notifies the parent of an approved purchase when purchase notifications are on (FR-081)', async () => {
      await service.authorize(
        event({ amountHalalas: 2500, merchantName: 'School canteen' }),
        'simulation',
      );
      expect(events.notify).toHaveBeenCalledWith(
        parentId.toString(),
        'allowance.purchase',
        expect.objectContaining({
          childName: 'Sara',
          merchant: 'School canteen',
          amountHalalas: 2500,
          outcome: 'approved',
        }),
        expect.anything(),
      );
    });

    it('notifies the parent of a declined purchase too, with the reason', async () => {
      await service.authorize(event({ amountHalalas: 3001 }), 'simulation');
      expect(events.notify).toHaveBeenCalledWith(
        parentId.toString(),
        'allowance.purchase',
        expect.objectContaining({
          outcome: 'declined',
          reason: 'OVER_PER_PURCHASE_LIMIT',
        }),
        expect.anything(),
      );
    });

    it('sends the parent nothing when purchase notifications are off, but the purchase is still recorded', async () => {
      settingsRepo.findByLinkId.mockResolvedValue({
        ...settings,
        purchaseNotifications: false,
      });
      await service.authorize(event(), 'simulation');
      await service.authorize(event({ amountHalalas: 3001 }), 'simulation');
      expect(
        events.notify.mock.calls.filter((c) => c[1] === 'allowance.purchase'),
      ).toHaveLength(0);
      expect(inserted).toHaveLength(2);
    });
  });

  describe('decline path', () => {
    it('records a decline with its reason, no ledger entry, and notifies the child (FR-043, US2-10)', async () => {
      const outcome = await service.authorize(
        event({ amountHalalas: 3001 }),
        'simulation',
      );
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'OVER_PER_PURCHASE_LIMIT',
      });
      expect(wallet.runInTransaction).not.toHaveBeenCalled();
      expect(wallet.transfer).not.toHaveBeenCalled();
      expect(inserted[0]).toMatchObject({
        outcome: 'declined',
        declineReason: 'OVER_PER_PURCHASE_LIMIT',
      });
      expect(events.notify).toHaveBeenCalledWith(
        childId.toString(),
        'allowance.purchaseDeclined',
        expect.objectContaining({
          merchant: 'Cafe',
          amountHalalas: 3001,
          reason: 'OVER_PER_PURCHASE_LIMIT',
        }),
        expect.anything(),
      );
    });
  });

  describe('Redis counter', () => {
    it('a miss rebuilds the counter and retries the reservation once', async () => {
      const miss = new Types.ObjectId();
      const localCard = { ...card, childUserId: miss };
      const localLink = { ...link, childUserId: miss };
      cards.findByRef.mockResolvedValue(localCard);
      links.findById.mockResolvedValue(localLink);
      const real = jest.spyOn(spend, 'reserve');
      const rebuild = jest.spyOn(spend, 'rebuild');
      // get() rebuilds once for the snapshot; deleting the key afterwards forces a miss at reserve time.
      const originalGet = spend.get.bind(spend);
      jest.spyOn(spend, 'get').mockImplementation(async (c, d) => {
        const v = await originalGet(c, d);
        await redis.del(SpendCounterService.key(c, d));
        return v;
      });
      const outcome = await service.authorize(event(), 'simulation');
      expect(outcome.outcome).toBe('approved');
      expect(real).toHaveBeenCalledTimes(2);
      expect(rebuild.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(
        await redis.get(SpendCounterService.key(miss.toString(), today)),
      ).toBe('2000');
    });

    it('a concurrent reservation that fills the limit declines OVER_DAILY_LIMIT without moving money', async () => {
      const racer = new Types.ObjectId();
      cards.findByRef.mockResolvedValue({ ...card, childUserId: racer });
      links.findById.mockResolvedValue({ ...link, childUserId: racer });
      await spend.rebuild(racer.toString(), today);
      // Snapshot says nothing was spent, but a competitor reserves 4,000 right after it.
      jest.spyOn(spend, 'get').mockImplementation(async () => {
        await spend.reserve(racer.toString(), today, 4000, 5000);
        return 0;
      });
      const outcome = await service.authorize(
        event({ amountHalalas: 2000 }),
        'simulation',
      );
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'OVER_DAILY_LIMIT',
      });
      expect(wallet.transfer).not.toHaveBeenCalled();
      expect(
        await redis.get(SpendCounterService.key(racer.toString(), today)),
      ).toBe('4000');
    });
  });

  describe('balance guard', () => {
    it('a failing $gte guard declines INSUFFICIENT_BALANCE and releases the counter exactly once, even if compensation runs twice', async () => {
      const guarded = new Types.ObjectId();
      cards.findByRef.mockResolvedValue({ ...card, childUserId: guarded });
      links.findById.mockResolvedValue({ ...link, childUserId: guarded });
      await spend.rebuild(guarded.toString(), today);
      wallet.transfer.mockRejectedValue(
        new InsufficientBalanceError(accountId),
      );

      const outcome = await service.authorize(
        event({ amountHalalas: 2000 }),
        'simulation',
      );
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'INSUFFICIENT_BALANCE',
      });
      expect(
        await redis.get(SpendCounterService.key(guarded.toString(), today)),
      ).toBe('0');

      // A second compensation for the same card transaction changes nothing.
      expect(
        await spend.release(
          guarded.toString(),
          today,
          2000,
          outcome.transactionId,
        ),
      ).toBe(false);
      expect(
        await redis.get(SpendCounterService.key(guarded.toString(), today)),
      ).toBe('0');
    });

    it('does not leave a reservation behind when the transaction fails for any other reason', async () => {
      const broken = new Types.ObjectId();
      cards.findByRef.mockResolvedValue({ ...card, childUserId: broken });
      links.findById.mockResolvedValue({ ...link, childUserId: broken });
      await spend.rebuild(broken.toString(), today);
      wallet.runInTransaction.mockRejectedValue(new Error('mongo down'));
      const outcome = await service.authorize(event(), 'simulation');
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'SERVICE_UNAVAILABLE',
      });
      expect(
        await redis.get(SpendCounterService.key(broken.toString(), today)),
      ).toBe('0');
    });
  });

  describe('fail closed', () => {
    it('more than the 1,500 ms budget → SERVICE_UNAVAILABLE recorded with no ledger entry', async () => {
      service.budgetMs = 30;
      let unblock!: () => void;
      wallet.runInTransaction.mockImplementation(
        () =>
          new Promise((resolve) => {
            unblock = () => resolve(undefined);
          }),
      );
      const outcome = await service.authorize(event(), 'simulation');
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'SERVICE_UNAVAILABLE',
      });
      expect(inserted).toHaveLength(1);
      expect(inserted[0]).toMatchObject({
        outcome: 'declined',
        declineReason: 'SERVICE_UNAVAILABLE',
      });
      expect(wallet.transfer).not.toHaveBeenCalled();
      unblock?.();
    });

    it('the default budget is 1,500 ms', () => {
      expect(
        new CardAuthorizationService(
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
          {} as never,
        ).budgetMs,
      ).toBe(1500);
    });

    it('ledger unavailable → SERVICE_UNAVAILABLE, recorded, nothing else touched', async () => {
      health.ledgerAvailable = false;
      const outcome = await service.authorize(event(), 'simulation');
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'SERVICE_UNAVAILABLE',
      });
      expect(wallet.runInTransaction).not.toHaveBeenCalled();
      expect(inserted[0]).toMatchObject({
        declineReason: 'SERVICE_UNAVAILABLE',
      });
    });

    it('an unexpected error is recorded as SERVICE_UNAVAILABLE rather than thrown', async () => {
      settingsRepo.findByLinkId.mockRejectedValue(new Error('boom'));
      const outcome = await service.authorize(event(), 'simulation');
      expect(outcome).toMatchObject({
        outcome: 'declined',
        declineReason: 'SERVICE_UNAVAILABLE',
      });
    });
  });

  describe('idempotency', () => {
    it('a duplicate issuerTxnId returns the first outcome and does nothing else', async () => {
      const first = { _id: new Types.ObjectId(), outcome: 'approved' };
      txns.findByIssuerTxn.mockResolvedValue(first);
      const outcome = await service.authorize(
        event({ issuerTxnId: 'iss_dup' }),
        'simulation',
      );
      expect(outcome).toEqual({
        transactionId: first._id.toString(),
        outcome: 'approved',
        duplicate: true,
      });
      expect(cards.findByRef).not.toHaveBeenCalled();
      expect(wallet.runInTransaction).not.toHaveBeenCalled();
    });
  });

  // Reversal and clearing come only from a real issuer; the simulator cannot send them.
  describe('reversal and clearing (contracts/issuer-provider.md)', () => {
    const original = {
      _id: new Types.ObjectId(),
      kind: 'authorization',
      outcome: 'approved',
      cardId,
      childUserId: childId,
      parentUserId: parentId,
      linkId,
      merchantName: 'Cafe',
      category: 'food_dining',
      amountHalalas: 2500,
      riyadhDate: today,
      issuerTxnId: 'auth_1',
    };

    beforeEach(() => {
      txns.findByIssuerTxn.mockImplementation((_p: string, id: string) =>
        Promise.resolve(id === 'auth_1' ? original : null),
      );
    });

    it('a reversal credits the amount back and releases the same-day counter once', async () => {
      const kid = new Types.ObjectId();
      const orig = { ...original, childUserId: kid };
      txns.findByIssuerTxn.mockImplementation((_p: string, id: string) =>
        Promise.resolve(id === 'auth_1' ? orig : null),
      );
      links.findById.mockResolvedValue({ ...link, childUserId: kid });
      await redis.set(
        SpendCounterService.key(kid.toString(), today),
        2500,
        'EX',
        3600,
      );

      const result = await service.reverse(
        {
          kind: 'reversal',
          issuerTxnId: 'rev_1',
          authIssuerTxnId: 'auth_1',
          amountHalalas: 2500,
          occurredAt: new Date(),
        },
        'issuer',
      );
      expect(result.creditedTo).toBe('child');
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EntryType.PURCHASE_REVERSAL,
          fromAccountId: settlementId,
          toAccountId: accountId,
          amountHalalas: 2500,
          idempotencyKey: 'card-rev:stub:rev_1',
        }),
        session,
      );
      expect(txns.setSettlement).toHaveBeenCalledWith(
        original._id,
        'reversed',
        session,
      );
      expect(txns.incRefunded).toHaveBeenCalledWith(
        original._id,
        2500,
        session,
      );
      expect(
        await redis.get(SpendCounterService.key(kid.toString(), today)),
      ).toBe('0');
    });

    it('replaying a reversal is idempotent: no second credit, counter untouched', async () => {
      const first = { _id: new Types.ObjectId(), outcome: 'approved' };
      txns.findByIssuerTxn.mockImplementation((_p: string, id: string) =>
        Promise.resolve(
          id === 'rev_1' ? first : id === 'auth_1' ? original : null,
        ),
      );
      const result = await service.reverse(
        {
          kind: 'reversal',
          issuerTxnId: 'rev_1',
          authIssuerTxnId: 'auth_1',
          amountHalalas: 2500,
          occurredAt: new Date(),
        },
        'issuer',
      );
      expect(result).toMatchObject({
        duplicate: true,
        transactionId: first._id.toString(),
      });
      expect(wallet.transfer).not.toHaveBeenCalled();
    });

    it('a reversal larger than what is left is refused (REFUND_EXCEEDS_REMAINING)', async () => {
      txns.incRefunded.mockResolvedValue(false);
      const err = await service
        .reverse(
          {
            kind: 'reversal',
            issuerTxnId: 'rev_2',
            authIssuerTxnId: 'auth_1',
            amountHalalas: 9999,
            occurredAt: new Date(),
          },
          'issuer',
        )
        .then(
          () => null,
          (e: { getResponse: () => { error: string } }) => e,
        );
      expect(err?.getResponse().error).toBe('REFUND_EXCEEDS_REMAINING');
    });

    it('a clearing for the same amount marks the purchase settled with no ledger movement', async () => {
      const res = await service.settle(
        {
          kind: 'clearing',
          issuerTxnId: 'clr_1',
          authIssuerTxnId: 'auth_1',
          amountHalalas: 2500,
          occurredAt: new Date(),
        },
        'issuer',
      );
      expect(res).toEqual({ settled: true, adjustmentHalalas: 0 });
      expect(txns.setSettlement).toHaveBeenCalledWith(
        original._id,
        'settled',
        session,
      );
      expect(wallet.transfer).not.toHaveBeenCalled();
    });

    it('a clearing for a higher amount posts one clearing_adjustment charging the child', async () => {
      await service.settle(
        {
          kind: 'clearing',
          issuerTxnId: 'clr_2',
          authIssuerTxnId: 'auth_1',
          amountHalalas: 2700,
          occurredAt: new Date(),
        },
        'issuer',
      );
      expect(wallet.transfer).toHaveBeenCalledTimes(1);
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EntryType.CLEARING_ADJUSTMENT,
          fromAccountId: accountId,
          toAccountId: settlementId,
          amountHalalas: 200,
          idempotencyKey: 'card-clear:stub:clr_2',
        }),
        session,
      );
    });

    it('a clearing for a lower amount credits the child the difference', async () => {
      await service.settle(
        {
          kind: 'clearing',
          issuerTxnId: 'clr_3',
          authIssuerTxnId: 'auth_1',
          amountHalalas: 2000,
          occurredAt: new Date(),
        },
        'issuer',
      );
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: settlementId,
          toAccountId: accountId,
          amountHalalas: 500,
        }),
        session,
      );
    });

    it('replaying a clearing reuses the same ledger key, so the ledger makes it idempotent', async () => {
      const clearing = {
        kind: 'clearing' as const,
        issuerTxnId: 'clr_4',
        authIssuerTxnId: 'auth_1',
        amountHalalas: 2600,
        occurredAt: new Date(),
      };
      await service.settle(clearing, 'issuer');
      await service.settle(clearing, 'issuer');
      const keys = wallet.transfer.mock.calls.map(
        (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
      );
      expect(keys).toEqual(['card-clear:stub:clr_4', 'card-clear:stub:clr_4']);
    });

    it('a refund after unlink credits the former parent’s wallet, not the child', async () => {
      links.findById.mockResolvedValue({ ...link, status: 'unlinked' });
      const parentWallet = new Types.ObjectId();
      wallet.getOrCreateUserWallet.mockResolvedValue({ _id: parentWallet });
      const result = await service.refund(
        {
          kind: 'refund',
          issuerTxnId: 'rf_1',
          cardRef: 'stub_1',
          originalIssuerTxnId: 'auth_1',
          amountHalalas: 1000,
          merchantName: 'Cafe',
          occurredAt: new Date(),
        },
        'issuer',
      );
      expect(result.creditedTo).toBe('former_parent');
      expect(wallet.getOrCreateUserWallet).toHaveBeenCalledWith(
        parentId,
        session,
      );
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EntryType.REFUND,
          toAccountId: parentWallet,
          idempotencyKey: 'card-refund:stub:rf_1',
        }),
        session,
      );
      expect(links.bumpRev).not.toHaveBeenCalled();
    });
  });
});
