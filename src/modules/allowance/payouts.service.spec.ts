import { Types } from 'mongoose';
import { PayoutsService } from './payouts.service';
import { AllowanceSchedulerProcessor } from './allowance-scheduler.processor';
import { InsufficientBalanceError } from '../wallet/ledger.errors';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';

describe('PayoutsService (026, US3, R14)', () => {
  const parentId = new Types.ObjectId();
  const childId = new Types.ObjectId();
  const linkId = new Types.ObjectId();
  const childAccount = new Types.ObjectId();
  const parentWallet = new Types.ObjectId();
  const session = { id: 's' };
  const link = {
    _id: linkId,
    parentUserId: parentId,
    childUserId: childId,
    childAccountId: childAccount,
    status: 'active',
  };

  let settingsDoc: Record<string, unknown>;
  let existingRows: Record<string, unknown>[];
  let links: Record<string, jest.Mock>;
  let settings: Record<string, jest.Mock>;
  let payouts: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let service: PayoutsService;
  const entry = {
    _id: new Types.ObjectId(),
    type: EntryType.ALLOWANCE_PAYOUT,
    amountHalalas: 30000,
    createdAt: new Date(),
    debitAccountId: parentWallet,
    creditAccountId: childAccount,
    refs: {},
    initiator: { kind: 'system' },
  };

  const code = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { getResponse?: () => { error?: string } } | null;
    return e?.getResponse?.().error;
  };

  beforeEach(() => {
    settingsDoc = {
      linkId,
      monthlyAmountHalalas: 30000,
      payoutDay: 15,
      payoutsActiveFromMonth: '2026-11',
    };
    existingRows = [];
    links = {
      findAllActive: jest.fn().mockResolvedValue([link]),
      findActiveByChild: jest.fn().mockResolvedValue(link),
      bumpRev: jest.fn().mockResolvedValue(2),
    };
    settings = {
      findByLinkIds: jest.fn(() => Promise.resolve([settingsDoc])),
      findByLinkId: jest.fn(() => Promise.resolve(settingsDoc)),
    };
    payouts = {
      findMonthsForChildren: jest.fn(() => Promise.resolve(existingRows)),
      findByChildAndMonth: jest.fn(() =>
        Promise.resolve(existingRows[0] ?? null),
      ),
      insert: jest.fn((d: Record<string, unknown>) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          createdAt: new Date(),
          ...d,
        }),
      ),
      findById: jest.fn(),
      markPaidLate: jest.fn(),
    };
    wallet = {
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
      getOrCreateUserWallet: jest.fn().mockResolvedValue({ _id: parentWallet }),
      findUserWallet: jest.fn().mockResolvedValue({ balanceHalalas: 0 }),
      transfer: jest.fn().mockResolvedValue({ entry, replayed: false }),
    };
    events = {
      summaryChanged: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };
    service = new PayoutsService(
      { assertParentOf: jest.fn().mockResolvedValue(link) } as never,
      links as never,
      settings as never,
      payouts as never,
      wallet as never,
      { getSummaryForLink: jest.fn().mockResolvedValue({ rev: 3 }) } as never,
      events as never,
      { findById: jest.fn().mockResolvedValue({ name: 'Sara' }) } as never,
      { set: jest.fn() } as never,
    );
  });

  describe('findDue', () => {
    const due = (iso: string) => service.findDue(new Date(iso));

    it('is due on the payout day', async () => {
      expect(await due('2026-11-15T10:00:00Z')).toEqual([
        { childId: childId.toString(), month: '2026-11' },
      ]);
    });

    it('is not due before the payout day', async () => {
      expect(await due('2026-11-14T10:00:00Z')).toEqual([]);
    });

    it('a second run in the same month does nothing (FR-034)', async () => {
      existingRows = [{ childUserId: childId }];
      expect(await due('2026-11-20T10:00:00Z')).toEqual([]);
    });

    it('an allowance turned back on after this month’s payout day pays from next month (no proration)', async () => {
      settingsDoc.payoutsActiveFromMonth = '2026-12';
      expect(await due('2026-11-18T10:00:00Z')).toEqual([]);
      expect(await due('2026-12-15T10:00:00Z')).toHaveLength(1);
    });

    it('an allowance set up after today’s payout time waits for next month', async () => {
      settingsDoc.payoutsActiveFromMonth = '2026-12';
      expect(await due('2026-11-15T10:00:00Z')).toEqual([]);
    });

    it('moving the payout day EARLIER after it already passed is caught up once, in the same month', async () => {
      settingsDoc.payoutDay = 10;
      expect(await due('2026-11-18T10:00:00Z')).toHaveLength(1);
    });

    it('moving the payout day LATER after the month was paid pays nothing more (no double payout)', async () => {
      existingRows = [{ childUserId: childId }];
      settingsDoc.payoutDay = 25;
      expect(await due('2026-11-26T10:00:00Z')).toEqual([]);
    });

    it('moving the payout day later before it is reached waits for it (no skipped month)', async () => {
      settingsDoc.payoutDay = 25;
      expect(await due('2026-11-18T10:00:00Z')).toEqual([]);
      expect(await due('2026-11-25T10:00:00Z')).toHaveLength(1);
    });

    it('day 31 in a 30-day month is paid on the last day', async () => {
      settingsDoc.payoutDay = 31;
      settingsDoc.payoutsActiveFromMonth = '2026-04';
      expect(await due('2026-04-29T10:00:00Z')).toEqual([]);
      expect(await due('2026-04-30T10:00:00Z')).toEqual([
        { childId: childId.toString(), month: '2026-04' },
      ]);
    });

    it('skips a zero allowance and a never-activated one', async () => {
      settingsDoc.monthlyAmountHalalas = 0;
      expect(await due('2026-11-18T10:00:00Z')).toEqual([]);
      settingsDoc.monthlyAmountHalalas = 30000;
      settingsDoc.payoutsActiveFromMonth = null;
      expect(await due('2026-11-18T10:00:00Z')).toEqual([]);
    });
  });

  describe('payOne', () => {
    it('US3-1: pays, records the row, and notifies both parent and child after commit', async () => {
      const r = await service.payOne(
        childId.toString(),
        '2026-11',
        new Date('2026-11-15T07:00:00Z'),
      );
      expect(r.status).toBe('paid');
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EntryType.ALLOWANCE_PAYOUT,
          fromAccountId: parentWallet,
          toAccountId: childAccount,
          amountHalalas: 30000,
          idempotencyKey: `payout:${childId.toString()}:2026-11`,
          riyadhDate: '2026-11-15',
        }),
        session,
      );
      expect(payouts.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'paid',
          month: '2026-11',
          scheduledFor: '2026-11-15',
          amountHalalas: 30000,
        }),
        session,
      );
      expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
      const to = events.notify.mock.calls.map((c) => [
        c[0],
        c[1],
        c[2].audience,
      ]);
      expect(to).toEqual(
        expect.arrayContaining([
          [childId.toString(), 'allowance.payoutPaid', 'child'],
          [parentId.toString(), 'allowance.payoutPaid', 'parent'],
        ]),
      );
      expect(events.summaryChanged).toHaveBeenCalledWith(
        childId.toString(),
        'payout',
        expect.anything(),
        link,
      );
      expect(events.summaryChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
        wallet.runInTransaction.mock.invocationCallOrder[0],
      );
    });

    it('US3-2: insufficient funds → a failed row, no entry kept, parent told with Pay now', async () => {
      wallet.transfer.mockRejectedValue(
        new InsufficientBalanceError(parentWallet),
      );
      const r = await service.payOne(childId.toString(), '2026-11');
      expect(r.status).toBe('failed');
      expect(payouts.insert).toHaveBeenCalledTimes(1);
      expect(payouts.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          failureReason: 'INSUFFICIENT_FUNDS',
        }),
      );
      expect(events.notify).toHaveBeenCalledTimes(1);
      expect(events.notify).toHaveBeenCalledWith(
        parentId.toString(),
        'allowance.payoutFailed',
        expect.objectContaining({
          reason: 'INSUFFICIENT_FUNDS',
          amountHalalas: 30000,
        }),
        expect.anything(),
      );
      expect(events.summaryChanged).toHaveBeenCalledWith(
        childId.toString(),
        'payout_failed',
        expect.anything(),
        link,
      );
    });

    it('a system error rethrows so the job retries: no failed row, no "insufficient funds" message', async () => {
      wallet.transfer.mockRejectedValue(new Error('mongo unavailable'));
      await expect(
        service.payOne(childId.toString(), '2026-11'),
      ).rejects.toThrow('mongo unavailable');
      expect(payouts.insert).not.toHaveBeenCalled();
      expect(events.notify).not.toHaveBeenCalled();
    });

    it('does nothing when the month already has a row (idempotent)', async () => {
      existingRows = [{ childUserId: childId }];
      expect(await service.payOne(childId.toString(), '2026-11')).toEqual({
        status: 'skipped',
      });
      expect(wallet.transfer).not.toHaveBeenCalled();
    });

    it('treats a duplicate-key race on (child, month) as already done', async () => {
      wallet.runInTransaction.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 11000 }),
      );
      expect(await service.payOne(childId.toString(), '2026-11')).toEqual({
        status: 'skipped',
      });
    });
  });

  describe('system failure after the last retry (SC-006)', () => {
    it('markSystemFailed writes a SERVICE_UNAVAILABLE row with no ledger entry and a push that never mentions funds', async () => {
      const r = await service.markSystemFailed(childId.toString(), '2026-11');
      expect(r.status).toBe('failed');
      expect(wallet.transfer).not.toHaveBeenCalled();
      expect(payouts.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          failureReason: 'SERVICE_UNAVAILABLE',
        }),
      );
      const vars = events.notify.mock.calls[0][2] as { reason: string };
      expect(vars.reason).toBe('SERVICE_UNAVAILABLE');
    });

    it('Pay now still works on a SERVICE_UNAVAILABLE payout', async () => {
      const row = {
        _id: new Types.ObjectId(),
        linkId,
        status: 'failed',
        failureReason: 'SERVICE_UNAVAILABLE',
        month: '2026-11',
        amountHalalas: 30000,
      };
      payouts.findById.mockResolvedValue(row);
      payouts.markPaidLate.mockResolvedValue({ ...row, status: 'paid_late' });
      const res = await service.payNow(
        parentId.toString(),
        childId.toString(),
        row._id.toString(),
        new Date('2026-11-20T10:00:00Z'),
      );
      expect(res.payout.status).toBe('paid_late');
    });

    describe('scheduler final-failure handling', () => {
      const alert = jest.fn().mockResolvedValue(undefined);
      const processor = () =>
        new AllowanceSchedulerProcessor(
          {} as never,
          service,
          {} as never,
          { alert } as never,
        );
      const job = (attemptsMade: number) => ({
        name: 'payout',
        data: { childId: childId.toString(), month: '2026-11' },
        attemptsMade,
        opts: { attempts: 6 },
      });

      beforeEach(() => alert.mockClear());

      it('does nothing before the last attempt', async () => {
        await processor().handleFailure(job(3) as never, new Error('x'));
        expect(payouts.insert).not.toHaveBeenCalled();
        expect(alert).not.toHaveBeenCalled();
      });

      it('on the last attempt: failed row, push, and the PAYOUT_SYSTEM_FAILURE ops alert', async () => {
        await processor().handleFailure(
          job(6) as never,
          new Error('ledger down'),
        );
        expect(payouts.insert).toHaveBeenCalledWith(
          expect.objectContaining({ failureReason: 'SERVICE_UNAVAILABLE' }),
        );
        expect(events.notify).toHaveBeenCalledWith(
          parentId.toString(),
          'allowance.payoutFailed',
          expect.objectContaining({ reason: 'SERVICE_UNAVAILABLE' }),
          expect.anything(),
        );
        expect(alert).toHaveBeenCalledWith(
          'PAYOUT_SYSTEM_FAILURE',
          expect.any(String),
          expect.objectContaining({
            childUserId: childId.toString(),
            month: '2026-11',
          }),
        );
      });

      it('the alert still goes out when writing the failed row fails too', async () => {
        payouts.insert.mockRejectedValue(new Error('db down'));
        await expect(
          processor().handleFailure(job(6) as never, new Error('ledger down')),
        ).resolves.toBeUndefined();
        expect(alert).toHaveBeenCalledTimes(1);
      });

      it('ignores other jobs', async () => {
        await processor().handleFailure(
          { ...job(6), name: 'payout-fanout' } as never,
          new Error('x'),
        );
        expect(alert).not.toHaveBeenCalled();
      });
    });
  });

  describe('Pay now (FR-032)', () => {
    const payout = () => ({
      _id: new Types.ObjectId(),
      linkId,
      status: 'failed',
      month: '2026-11',
      amountHalalas: 30000,
    });
    const pay = (
      row: ReturnType<typeof payout>,
      asOf = '2026-11-20T10:00:00Z',
    ) =>
      service.payNow(
        parentId.toString(),
        childId.toString(),
        row._id.toString(),
        new Date(asOf),
      );

    it('pays a failed payout as paid_late with the same ledger key as the scheduler', async () => {
      const row = payout();
      payouts.findById.mockResolvedValue(row);
      payouts.markPaidLate.mockResolvedValue({ ...row, status: 'paid_late' });
      const res = await pay(row);
      expect(res.payout).toMatchObject({
        status: 'paid_late',
        month: '2026-11',
        amountHalalas: 30000,
      });
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `payout:${childId.toString()}:2026-11`,
          initiator: expect.objectContaining({ kind: 'parent' }),
        }),
        session,
      );
    });

    it('exactly once even on a double tap: the second guarded update finds it no longer failed', async () => {
      const row = payout();
      payouts.findById.mockResolvedValue(row);
      payouts.markPaidLate
        .mockResolvedValueOnce({ ...row, status: 'paid_late' })
        .mockResolvedValueOnce(null);
      expect((await pay(row)).payout.status).toBe('paid_late');
      expect(await code(pay(row))).toBe('PAYOUT_NOT_PAYABLE');
    });

    it('PAYOUT_NOT_PAYABLE after the next payout date', async () => {
      const row = payout();
      payouts.findById.mockResolvedValue(row);
      payouts.markPaidLate.mockResolvedValue({ ...row, status: 'paid_late' });
      expect((await pay(row, '2026-12-14T20:59:00Z')).payout.status).toBe(
        'paid_late',
      );
      expect(await code(pay(row, '2026-12-14T21:00:00Z'))).toBe(
        'PAYOUT_NOT_PAYABLE',
      );
    });

    it('PAYOUT_NOT_PAYABLE when already paid, for another family, or unknown', async () => {
      payouts.findById.mockResolvedValue({ ...payout(), status: 'paid' });
      expect(await code(pay(payout()))).toBe('PAYOUT_NOT_PAYABLE');
      payouts.findById.mockResolvedValue({
        ...payout(),
        linkId: new Types.ObjectId(),
      });
      expect(await code(pay(payout()))).toBe('PAYOUT_NOT_PAYABLE');
      payouts.findById.mockResolvedValue(null);
      expect(await code(pay(payout()))).toBe('PAYOUT_NOT_PAYABLE');
      expect(
        await code(
          service.payNow(parentId.toString(), childId.toString(), 'not-an-id'),
        ),
      ).toBe('PAYOUT_NOT_PAYABLE');
    });

    it('INSUFFICIENT_FUNDS leaves the payout failed', async () => {
      const row = payout();
      payouts.findById.mockResolvedValue(row);
      wallet.transfer.mockRejectedValue(
        new InsufficientBalanceError(parentWallet),
      );
      expect(await code(pay(row))).toBe('INSUFFICIENT_FUNDS');
      expect(events.notify).not.toHaveBeenCalled();
    });
  });
});
