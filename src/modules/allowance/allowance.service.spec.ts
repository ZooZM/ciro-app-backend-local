import { Types } from 'mongoose';
import {
  AllowanceService,
  firstPayoutMonth,
  nextPayoutDate,
} from './allowance.service';
import { UpdateAllowanceSettingsDto } from './dto/update-allowance-settings.dto';
import { InsufficientBalanceError } from '../wallet/ledger.errors';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';

describe('AllowanceService settings (026, US1)', () => {
  const parentId = new Types.ObjectId().toString();
  const childId = new Types.ObjectId().toString();
  const linkId = new Types.ObjectId();
  const session = { id: 's' };
  const base: UpdateAllowanceSettingsDto = {
    monthlyAmountHalalas: 30000,
    payoutDay: 15,
    dailyLimitHalalas: 5000,
    perPurchaseMaxHalalas: 3000,
    blockedCategories: ['gaming'],
    purchaseNotifications: true,
  };

  let access: Record<string, jest.Mock>;
  let links: Record<string, jest.Mock>;
  let settingsRepo: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let service: AllowanceService;
  let current: Record<string, unknown>;

  beforeEach(() => {
    current = {
      monthlyAmountHalalas: 0,
      payoutDay: 1,
      payoutsActiveFromMonth: null,
    };
    access = {
      assertParentOf: jest.fn().mockResolvedValue({
        _id: linkId,
        childUserId: new Types.ObjectId(childId),
      }),
      assertLinkedChild: jest.fn(),
    };
    links = { bumpRev: jest.fn().mockResolvedValue(2) };
    settingsRepo = {
      findByLinkId: jest.fn(() => Promise.resolve(current)),
      update: jest.fn((_l: unknown, set: Record<string, unknown>) =>
        Promise.resolve({
          ...current,
          ...set,
          childUserId: new Types.ObjectId(childId),
          updatedAt: new Date(),
        }),
      ),
    };
    events = { summaryChanged: jest.fn().mockResolvedValue(undefined) };
    wallet = {
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
    };
    service = new AllowanceService(
      access as never,
      links as never,
      settingsRepo as never,
      {} as never,
      events as never,
      wallet as never,
    );
  });

  const code = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { getResponse?: () => { error?: string } } | null;
    return e?.getResponse?.().error;
  };

  it('US1-6: per-purchase maximum above the daily limit → PER_PURCHASE_ABOVE_DAILY_LIMIT, nothing written', async () => {
    const dto = {
      ...base,
      dailyLimitHalalas: 2000,
      perPurchaseMaxHalalas: 2500,
    };
    expect(await code(service.updateSettings(parentId, childId, dto))).toBe(
      'PER_PURCHASE_ABOVE_DAILY_LIMIT',
    );
    expect(wallet.runInTransaction).not.toHaveBeenCalled();
  });

  it('accepts a per-purchase maximum equal to the daily limit', async () => {
    const dto = {
      ...base,
      dailyLimitHalalas: 3000,
      perPurchaseMaxHalalas: 3000,
    };
    await expect(
      service.updateSettings(parentId, childId, dto),
    ).resolves.toBeDefined();
  });

  it('rejects always-blocked categories inside blockedCategories', async () => {
    const dto = {
      ...base,
      blockedCategories: ['gambling'],
    } as unknown as UpdateAllowanceSettingsDto;
    await expect(
      service.updateSettings(parentId, childId, dto),
    ).rejects.toBeDefined();
    expect(wallet.runInTransaction).not.toHaveBeenCalled();
  });

  it('checks ownership first (a stranger gets the 404 from FamilyAccessService)', async () => {
    access.assertParentOf.mockRejectedValue(new Error('CHILD_NOT_FOUND'));
    await expect(
      service.updateSettings(parentId, childId, base),
    ).rejects.toThrow('CHILD_NOT_FOUND');
    expect(wallet.runInTransaction).not.toHaveBeenCalled();
  });

  describe('payoutsActiveFromMonth (research R14)', () => {
    it('is set when the amount goes from 0 to above 0: next month once the payout date has passed', async () => {
      await service.updateSettings(
        parentId,
        childId,
        base,
        new Date('2026-11-18T10:00:00Z'),
      );
      expect(settingsRepo.update.mock.calls[0][1]).toMatchObject({
        payoutsActiveFromMonth: '2026-12',
      });
    });

    it('is set to this month when the payout date is still ahead', async () => {
      await service.updateSettings(
        parentId,
        childId,
        base,
        new Date('2026-11-10T10:00:00Z'),
      );
      expect(settingsRepo.update.mock.calls[0][1]).toMatchObject({
        payoutsActiveFromMonth: '2026-11',
      });
    });

    it('is set again each time an allowance is turned back on', async () => {
      current = {
        monthlyAmountHalalas: 0,
        payoutDay: 15,
        payoutsActiveFromMonth: '2026-06',
      };
      await service.updateSettings(
        parentId,
        childId,
        base,
        new Date('2026-11-18T10:00:00Z'),
      );
      expect(settingsRepo.update.mock.calls[0][1]).toMatchObject({
        payoutsActiveFromMonth: '2026-12',
      });
    });

    it('is left alone when the amount only changes while already above 0', async () => {
      current = {
        monthlyAmountHalalas: 20000,
        payoutDay: 15,
        payoutsActiveFromMonth: '2026-10',
      };
      await service.updateSettings(
        parentId,
        childId,
        base,
        new Date('2026-11-18T10:00:00Z'),
      );
      expect(settingsRepo.update.mock.calls[0][1]).not.toHaveProperty(
        'payoutsActiveFromMonth',
      );
    });

    it('is left alone when set to 0', async () => {
      current = {
        monthlyAmountHalalas: 20000,
        payoutDay: 15,
        payoutsActiveFromMonth: '2026-10',
      };
      await service.updateSettings(parentId, childId, {
        ...base,
        monthlyAmountHalalas: 0,
      });
      expect(settingsRepo.update.mock.calls[0][1]).not.toHaveProperty(
        'payoutsActiveFromMonth',
      );
    });

    it('firstPayoutMonth: on the payout day, before 06:00 Riyadh is this month, after is next', () => {
      expect(firstPayoutMonth(15, new Date('2026-11-15T02:59:00Z'))).toBe(
        '2026-11',
      );
      expect(firstPayoutMonth(15, new Date('2026-11-15T03:00:00Z'))).toBe(
        '2026-12',
      );
    });

    it('firstPayoutMonth clamps day 31 in a 30-day month', () => {
      expect(firstPayoutMonth(31, new Date('2026-04-29T10:00:00Z'))).toBe(
        '2026-04',
      );
      expect(firstPayoutMonth(31, new Date('2026-04-30T10:00:00Z'))).toBe(
        '2026-05',
      );
    });
  });

  it('bumps rev in the same transaction and emits allowanceUpdated{settings} after commit', async () => {
    await service.updateSettings(parentId, childId, base);
    expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
    expect(events.summaryChanged).toHaveBeenCalledWith(childId, 'settings');
    expect(events.summaryChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
      wallet.runInTransaction.mock.invocationCallOrder[0],
    );
  });

  it('returns the DTO with alwaysBlockedCategories and nextPayoutDate', async () => {
    const dto = await service.updateSettings(
      parentId,
      childId,
      base,
      new Date('2026-11-18T10:00:00Z'),
    );
    expect(dto).toMatchObject({
      childId,
      alwaysBlockedCategories: ['gambling', 'alcohol_tobacco', 'adult'],
      nextPayoutDate: '2026-12-15',
      currency: 'SAR',
    });
  });

  it('nextPayoutDate is null without an allowance and the same day on the payout day', () => {
    expect(nextPayoutDate(0, 15, new Date('2026-11-18T10:00:00Z'))).toBeNull();
    expect(nextPayoutDate(100, 15, new Date('2026-11-15T10:00:00Z'))).toBe(
      '2026-11-15',
    );
  });
});

describe('AllowanceService balance controls (026, US6)', () => {
  const parentId = new Types.ObjectId().toString();
  const childId = new Types.ObjectId().toString();
  const linkId = new Types.ObjectId();
  const childAccount = new Types.ObjectId();
  const parentWallet = new Types.ObjectId();
  const session = { id: 's' };
  const link = {
    _id: linkId,
    childUserId: new Types.ObjectId(childId),
    childAccountId: childAccount,
  };

  let links: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let summaries: Record<string, jest.Mock>;
  let service: AllowanceService;
  const entry = {
    _id: new Types.ObjectId(),
    type: EntryType.TOP_UP,
    amountHalalas: 5000,
    createdAt: new Date(),
    debitAccountId: parentWallet,
    creditAccountId: childAccount,
    refs: {},
    initiator: { kind: 'parent' },
  };

  const code = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { getResponse?: () => { error?: string } } | null;
    return e?.getResponse?.().error;
  };

  beforeEach(() => {
    links = { bumpRev: jest.fn().mockResolvedValue(5) };
    events = {
      summaryChanged: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };
    summaries = { getSummaryForLink: jest.fn().mockResolvedValue({ rev: 5 }) };
    wallet = {
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
      getOrCreateUserWallet: jest.fn().mockResolvedValue({ _id: parentWallet }),
      transfer: jest.fn().mockResolvedValue({ entry, replayed: false }),
      getBalance: jest.fn().mockResolvedValue(7000),
    };
    service = new AllowanceService(
      { assertParentOf: jest.fn().mockResolvedValue(link) } as never,
      links as never,
      {} as never,
      summaries as never,
      events as never,
      wallet as never,
    );
  });

  it('top-up: parent wallet → child account with key topup:{key}, one transaction, rev bumped', async () => {
    const res = await service.topUp(parentId, childId, 5000, 'k1');
    expect(wallet.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EntryType.TOP_UP,
        fromAccountId: parentWallet,
        toAccountId: childAccount,
        amountHalalas: 5000,
        idempotencyKey: 'topup:k1',
        initiator: expect.objectContaining({ kind: 'parent' }),
      }),
      session,
    );
    expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
    expect(res).toMatchObject({
      entryId: entry._id.toString(),
      parentBalanceHalalas: 7000,
      summary: { rev: 5 },
    });
  });

  it('pull-back: child account → parent wallet with key pullback:{key}', async () => {
    await service.pullBack(parentId, childId, 3000, 'k2');
    expect(wallet.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EntryType.PULL_BACK,
        fromAccountId: childAccount,
        toAccountId: parentWallet,
        idempotencyKey: 'pullback:k2',
      }),
      session,
    );
  });

  it('top-up with too little in the wallet → INSUFFICIENT_FUNDS', async () => {
    wallet.transfer.mockRejectedValue(
      new InsufficientBalanceError(parentWallet),
    );
    expect(await code(service.topUp(parentId, childId, 5000, 'k3'))).toBe(
      'INSUFFICIENT_FUNDS',
    );
    expect(events.summaryChanged).not.toHaveBeenCalled();
  });

  it('US6-3: a pull-back above the child balance → 409 AMOUNT_EXCEEDS_CHILD_BALANCE', async () => {
    wallet.transfer.mockRejectedValue(
      new InsufficientBalanceError(childAccount),
    );
    expect(await code(service.pullBack(parentId, childId, 99999, 'k4'))).toBe(
      'AMOUNT_EXCEEDS_CHILD_BALANCE',
    );
  });

  it('a replay with the same Idempotency-Key returns the same entryId and changes nothing else', async () => {
    wallet.transfer.mockResolvedValue({ entry, replayed: true });
    const res = await service.topUp(parentId, childId, 5000, 'k1');
    expect(res.entryId).toBe(entry._id.toString());
    expect(links.bumpRev).not.toHaveBeenCalled();
    expect(events.summaryChanged).not.toHaveBeenCalled();
    expect(events.notify).not.toHaveBeenCalled();
  });

  it('events and the child push fire only after commit', async () => {
    await service.topUp(parentId, childId, 5000, 'k5');
    const txn = wallet.runInTransaction.mock.invocationCallOrder[0];
    expect(events.summaryChanged).toHaveBeenCalledWith(
      childId,
      'top_up',
      expect.objectContaining({ kind: 'top_up' }),
      link,
    );
    expect(events.summaryChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
      txn,
    );
    expect(events.notify).toHaveBeenCalledWith(
      childId,
      'allowance.topUp',
      { amountHalalas: 5000, childId },
      { childId },
    );
    expect(events.notify.mock.invocationCallOrder[0]).toBeGreaterThan(txn);
  });
});
