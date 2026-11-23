import { Types } from 'mongoose';
import { ChildSummaryService, windowTotals } from './child-summary.service';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';

describe('ChildSummaryService (026, T045/T046)', () => {
  const childId = new Types.ObjectId();
  const linkId = new Types.ObjectId();
  const accountId = new Types.ObjectId();
  const settlement = new Types.ObjectId();
  const parentWallet = new Types.ObjectId();
  const link = {
    _id: linkId,
    childUserId: childId,
    parentUserId: new Types.ObjectId(),
    childAccountId: accountId,
    rev: 7,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  const settings = {
    monthlyAmountHalalas: 30000,
    payoutDay: 15,
    dailyLimitHalalas: 4000,
    perPurchaseMaxHalalas: 3000,
  };

  let boosts: { amountFor: jest.Mock };
  let spend: { get: jest.Mock };
  let payouts: { findLatestFailed: jest.Mock };
  let entries: { findForAccount: jest.Mock };
  let service: ChildSummaryService;

  beforeEach(() => {
    boosts = { amountFor: jest.fn().mockResolvedValue(0) };
    spend = { get: jest.fn().mockResolvedValue(0) };
    payouts = { findLatestFailed: jest.fn().mockResolvedValue(null) };
    entries = { findForAccount: jest.fn().mockResolvedValue([]) };
    service = new ChildSummaryService(
      {
        findById: jest.fn().mockResolvedValue(link),
        findActiveByChild: jest.fn().mockResolvedValue(link),
      } as never,
      { findByLinkId: jest.fn().mockResolvedValue(settings) } as never,
      {
        findByLinkId: jest.fn().mockResolvedValue({ status: 'active' }),
      } as never,
      {
        findPendingByLink: jest.fn().mockResolvedValue(null),
        findLastResolvedSince: jest.fn().mockResolvedValue(null),
      } as never,
      payouts as never,
      boosts as never,
      spend as never,
      { getBalance: jest.fn().mockResolvedValue(17500) } as never,
      entries as never,
      { findById: jest.fn().mockResolvedValue({ name: 'Sara' }) } as never,
    );
  });

  it('counts only today’s boost in the effective limit (US5-6)', async () => {
    const now = new Date('2026-11-18T10:00:00Z');
    boosts.amountFor.mockImplementation((_c: unknown, date: string) =>
      Promise.resolve(date === '2026-11-18' ? 5000 : 99999),
    );
    const s = await service.getSummaryForLink(link as never, now);
    expect(boosts.amountFor).toHaveBeenCalledWith(childId, '2026-11-18');
    expect(s.effectiveDailyLimitHalalas).toBe(9000);
    expect(s.limits.dailyLimitHalalas).toBe(4000);
  });

  it('takes spentToday from today’s counter only, so a later-day refund does not change it', async () => {
    const now = new Date('2026-11-19T10:00:00Z');
    spend.get.mockImplementation((_c: string, date: string) =>
      Promise.resolve(date === '2026-11-19' ? 1000 : 4000),
    );
    const s = await service.getSummaryForLink(link as never, now);
    expect(spend.get).toHaveBeenCalledWith(childId.toString(), '2026-11-19');
    expect(s.spentTodayHalalas).toBe(1000);
    expect(s.availableTodayHalalas).toBe(3000);
  });

  it('shows failedPayout until the next payout date, then drops it', async () => {
    payouts.findLatestFailed.mockResolvedValue({
      _id: new Types.ObjectId(),
      month: '2026-11',
      amountHalalas: 30000,
      failureReason: 'INSUFFICIENT_FUNDS',
    });
    const before = await service.getSummaryForLink(
      link as never,
      new Date('2026-12-14T20:59:00Z'),
    );
    expect(before.failedPayout).toMatchObject({
      month: '2026-11',
      payableUntil: '2026-12-14T21:00:00.000Z',
    });
    const after = await service.getSummaryForLink(
      link as never,
      new Date('2026-12-14T21:00:00Z'),
    );
    expect(after.failedPayout).toBeNull();
  });

  it('computes window figures and nextDay', async () => {
    entries.findForAccount.mockResolvedValue([
      {
        type: EntryType.ALLOWANCE_PAYOUT,
        amountHalalas: 30000,
        debitAccountId: parentWallet,
        creditAccountId: accountId,
      },
      {
        type: EntryType.PURCHASE,
        amountHalalas: 12500,
        debitAccountId: accountId,
        creditAccountId: settlement,
      },
      {
        type: EntryType.TOP_UP,
        amountHalalas: 5000,
        debitAccountId: parentWallet,
        creditAccountId: accountId,
      },
    ]);
    const s = await service.getSummaryForLink(
      link as never,
      new Date('2026-11-18T15:04:05Z'),
    );
    expect(s).toMatchObject({
      childName: 'Sara',
      rev: 7,
      balanceHalalas: 17500,
      allowancePaidThisMonthHalalas: 30000,
      spentThisMonthHalalas: 12500,
      leftThisMonthHalalas: 17500,
      allowanceWindow: { from: '2026-11-15', to: '2026-12-14' },
      cardStatus: 'active',
      nextDay: {
        startsAt: '2026-11-18T21:00:00.000Z',
        availableTodayHalalas: 4000,
      },
      limits: { maxRequestHalalas: 50000 },
    });
  });

  it('windowTotals nets refunds, reversals and clearing adjustments', () => {
    const t = windowTotals(
      [
        {
          type: EntryType.PURCHASE,
          amountHalalas: 5000,
          debitAccountId: accountId,
          creditAccountId: settlement,
        },
        {
          type: EntryType.REFUND,
          amountHalalas: 1000,
          debitAccountId: settlement,
          creditAccountId: accountId,
        },
        {
          type: EntryType.PURCHASE_REVERSAL,
          amountHalalas: 500,
          debitAccountId: settlement,
          creditAccountId: accountId,
        },
        {
          type: EntryType.CLEARING_ADJUSTMENT,
          amountHalalas: 200,
          debitAccountId: accountId,
          creditAccountId: settlement,
        },
      ] as never,
      accountId,
    );
    expect(t).toEqual({ paid: 0, spent: 3700 });
  });

  it('marks requests above the per-purchase maximum', () => {
    const dto = service.toAllowanceRequestDto(
      {
        _id: new Types.ObjectId(),
        childUserId: childId,
        amountHalalas: 5000,
        reason: 'food',
        source: 'watch',
        status: 'pending',
        expiresAt: new Date('2026-11-19T10:00:00Z'),
        createdAt: new Date('2026-11-18T10:00:00Z'),
      } as never,
      settings as never,
      'Sara',
    );
    expect(dto).toMatchObject({
      exceedsPerPurchaseMax: true,
      approvedAmountHalalas: null,
      currency: 'SAR',
    });
  });
});
