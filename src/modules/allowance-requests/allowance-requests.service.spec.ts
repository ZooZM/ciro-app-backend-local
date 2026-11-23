import { Types } from 'mongoose';
import { AllowanceRequestsService } from './allowance-requests.service';
import { InsufficientBalanceError } from '../wallet/ledger.errors';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';

describe('AllowanceRequestsService (026, US5)', () => {
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
  };

  let pending: Record<string, unknown>;
  let store: Record<string, unknown> | null;
  let access: Record<string, jest.Mock>;
  let links: Record<string, jest.Mock>;
  let requests: Record<string, jest.Mock>;
  let boosts: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let summaries: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let queue: { add: jest.Mock };
  let service: AllowanceRequestsService;
  const entry = {
    _id: new Types.ObjectId(),
    type: EntryType.REQUEST_APPROVAL,
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
    )) as { getResponse?: () => { error?: string; data?: unknown } } | null;
    return { error: e?.getResponse?.().error, data: e?.getResponse?.().data };
  };
  const createDto = {
    amountHalalas: 5000,
    reason: 'food' as const,
    source: 'watch' as const,
  };

  beforeEach(() => {
    pending = {
      _id: new Types.ObjectId(),
      childUserId: childId,
      parentUserId: parentId,
      linkId,
      amountHalalas: 5000,
      reason: 'food',
      source: 'watch',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    store = pending;
    access = {
      assertLinkedChild: jest.fn().mockResolvedValue(link),
      assertParentOf: jest.fn().mockResolvedValue(link),
    };
    links = { bumpRev: jest.fn().mockResolvedValue(2) };
    requests = {
      insert: jest.fn((d: Record<string, unknown>) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          createdAt: new Date(),
          ...d,
        }),
      ),
      findById: jest.fn(() => Promise.resolve(store)),
      findPendingByChild: jest.fn().mockResolvedValue(pending),
      transition: jest.fn((_id: unknown, set: Record<string, unknown>) =>
        Promise.resolve({ ...pending, ...set }),
      ),
      findOverdue: jest.fn().mockResolvedValue([]),
    };
    boosts = { addBoost: jest.fn().mockResolvedValue(undefined) };
    wallet = {
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
      getOrCreateUserWallet: jest.fn().mockResolvedValue({ _id: parentWallet }),
      transfer: jest.fn().mockResolvedValue({ entry, replayed: false }),
    };
    summaries = {
      requestDto: jest.fn((r: Record<string, unknown>) =>
        Promise.resolve({
          id: String(r._id),
          status: r.status,
          childName: 'Sara',
        }),
      ),
      getSummaryForLink: jest.fn().mockResolvedValue({ rev: 4 }),
    };
    events = {
      requestCreated: jest.fn((r: Record<string, unknown>) =>
        Promise.resolve({ id: String(r._id), childName: 'Sara' }),
      ),
      requestResolved: jest.fn((r: Record<string, unknown>) =>
        Promise.resolve({ id: String(r._id), status: r.status }),
      ),
      summaryChanged: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new AllowanceRequestsService(
      access as never,
      links as never,
      requests as never,
      boosts as never,
      wallet as never,
      summaries as never,
      events as never,
      queue as never,
    );
  });

  describe('create (child)', () => {
    it('inserts with a 24 h expiry, bumps rev, schedules the expiry job, and notifies the parent after commit', async () => {
      const now = new Date('2026-11-18T10:00:00Z');
      await service.create(childId.toString(), createDto, now);
      expect(requests.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          amountHalalas: 5000,
          reason: 'food',
          source: 'watch',
          expiresAt: new Date('2026-11-19T10:00:00Z'),
        }),
        session,
      );
      expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
      expect(queue.add).toHaveBeenCalledWith(
        'request-expire',
        expect.anything(),
        expect.objectContaining({
          delay: expect.any(Number),
          jobId: expect.not.stringContaining(':'),
        }),
      );
      expect(events.requestCreated).toHaveBeenCalled();
      expect(events.requestCreated.mock.invocationCallOrder[0]).toBeGreaterThan(
        wallet.runInTransaction.mock.invocationCallOrder[0],
      );
    });

    it('the parent push is always sent, with the actionable category (FR-053)', async () => {
      await service.create(childId.toString(), createDto);
      expect(events.notify).toHaveBeenCalledWith(
        parentId.toString(),
        'allowance.requestCreated',
        expect.objectContaining({ amountHalalas: 5000, reason: 'food' }),
        expect.objectContaining({
          apnsCategory: 'ALLOWANCE_REQUEST',
          data: { requestId: expect.any(String) },
        }),
      );
    });

    it('a second request → 409 REQUEST_ALREADY_PENDING with data.pending', async () => {
      wallet.runInTransaction.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 11000 }),
      );
      const r = await code(service.create(childId.toString(), createDto));
      expect(r.error).toBe('REQUEST_ALREADY_PENDING');
      expect(r.data).toEqual({
        pending: expect.objectContaining({
          id: String(pending._id),
          status: 'pending',
        }),
      });
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('a queue failure never fails the request (the sweep expires it anyway)', async () => {
      queue.add.mockRejectedValue(new Error('redis down'));
      await expect(
        service.create(childId.toString(), createDto),
      ).resolves.toBeDefined();
    });
  });

  describe('cancel', () => {
    it('only the owner can cancel', async () => {
      const r = await code(
        service.cancel(new Types.ObjectId().toString(), String(pending._id)),
      );
      expect(r.error).toBe('CHILD_NOT_FOUND');
      expect(requests.transition).not.toHaveBeenCalled();
    });

    it('cancels a pending request and tells both sides', async () => {
      await service.cancel(childId.toString(), String(pending._id));
      expect(requests.transition).toHaveBeenCalledWith(
        pending._id,
        expect.objectContaining({ status: 'cancelled' }),
        session,
      );
      expect(events.requestResolved).toHaveBeenCalled();
    });

    it('after it was answered → 409 REQUEST_ALREADY_RESOLVED with the current request', async () => {
      requests.transition.mockResolvedValue(null);
      store = { ...pending, status: 'approved' };
      const r = await code(
        service.cancel(childId.toString(), String(pending._id)),
      );
      expect(r.error).toBe('REQUEST_ALREADY_RESOLVED');
      expect(r.data).toEqual({
        request: expect.objectContaining({ status: 'approved' }),
      });
    });
  });

  describe('approve (parent)', () => {
    const approve = (
      amount: number,
      note?: string,
      now = new Date('2026-11-18T10:00:00Z'),
    ) =>
      service.approve(
        parentId.toString(),
        String(pending._id),
        { amountHalalas: amount, note },
        now,
      );

    it('full amount → approved; moves money and raises today’s limit in ONE transaction', async () => {
      await approve(5000);
      expect(wallet.runInTransaction).toHaveBeenCalledTimes(1);
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EntryType.REQUEST_APPROVAL,
          fromAccountId: parentWallet,
          toAccountId: childAccount,
          amountHalalas: 5000,
          idempotencyKey: `request:${String(pending._id)}`,
        }),
        session,
      );
      expect(requests.transition).toHaveBeenCalledWith(
        pending._id,
        expect.objectContaining({
          status: 'approved',
          approvedAmountHalalas: 5000,
        }),
        session,
      );
      expect(boosts.addBoost).toHaveBeenCalledWith(
        childId,
        '2026-11-18',
        5000,
        pending._id,
        session,
      );
      expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
    });

    it('0 < x < amount → partially_approved, boost is the approved amount, note kept', async () => {
      await approve(2000, '  Use it for lunch  ');
      expect(requests.transition).toHaveBeenCalledWith(
        pending._id,
        expect.objectContaining({
          status: 'partially_approved',
          approvedAmountHalalas: 2000,
          parentNote: 'Use it for lunch',
        }),
        session,
      );
      expect(boosts.addBoost).toHaveBeenCalledWith(
        childId,
        '2026-11-18',
        2000,
        pending._id,
        session,
      );
    });

    it.each([0, -1, 5001, 12.5, Number.NaN])(
      'rejects approved amount %p with 400 APPROVED_AMOUNT_INVALID',
      async (amount) => {
        expect((await code(approve(amount))).error).toBe(
          'APPROVED_AMOUNT_INVALID',
        );
        expect(wallet.runInTransaction).not.toHaveBeenCalled();
      },
    );

    it('US5-7: INSUFFICIENT_FUNDS leaves the request pending (no boost, no transition)', async () => {
      wallet.transfer.mockRejectedValue(
        new InsufficientBalanceError(parentWallet),
      );
      expect((await code(approve(5000))).error).toBe('INSUFFICIENT_FUNDS');
      expect(requests.transition).not.toHaveBeenCalled();
      expect(boosts.addBoost).not.toHaveBeenCalled();
      expect(events.requestResolved).not.toHaveBeenCalled();
    });

    it('a second answer → 409 REQUEST_ALREADY_RESOLVED with the current request', async () => {
      store = { ...pending, status: 'declined' };
      const r = await code(approve(5000));
      expect(r.error).toBe('REQUEST_ALREADY_RESOLVED');
      expect(r.data).toEqual({
        request: expect.objectContaining({ status: 'declined' }),
      });
      expect(wallet.runInTransaction).not.toHaveBeenCalled();
    });

    it('losing the race inside the transaction aborts it (the ledger entry rolls back) and returns the current request', async () => {
      requests.transition.mockResolvedValue(null);
      store = pending;
      requests.findById
        .mockResolvedValueOnce(pending)
        .mockResolvedValue({ ...pending, status: 'approved' });
      const r = await code(approve(5000));
      expect(r.error).toBe('REQUEST_ALREADY_RESOLVED');
      expect(r.data).toEqual({
        request: expect.objectContaining({ status: 'approved' }),
      });
      expect(boosts.addBoost).not.toHaveBeenCalled();
      expect(events.requestResolved).not.toHaveBeenCalled();
    });

    it('the boost goes to the Riyadh day of the approval, even just after midnight', async () => {
      await approve(5000, undefined, new Date('2026-11-18T21:30:00Z')); // 00:30 on the 19th in Riyadh
      expect(boosts.addBoost).toHaveBeenCalledWith(
        childId,
        '2026-11-19',
        5000,
        pending._id,
        session,
      );
    });

    it('does not look at the card, so approving while it is paused works', async () => {
      await expect(approve(5000)).resolves.toBeDefined();
    });

    it('after commit: resolved event, summary change, and the child’s push with amount and note', async () => {
      await approve(2000, 'Lunch');
      const txn = wallet.runInTransaction.mock.invocationCallOrder[0];
      expect(
        events.requestResolved.mock.invocationCallOrder[0],
      ).toBeGreaterThan(txn);
      expect(events.summaryChanged).toHaveBeenCalledWith(
        childId.toString(),
        'request_approved',
        expect.anything(),
        link,
      );
      expect(events.notify).toHaveBeenCalledWith(
        childId.toString(),
        'allowance.requestResolved',
        expect.objectContaining({
          status: 'partially_approved',
          approvedAmountHalalas: 2000,
          note: 'Lunch',
        }),
        expect.anything(),
      );
    });

    it('a request that is not this parent’s gets 404', async () => {
      store = { ...pending, parentUserId: new Types.ObjectId() };
      expect((await code(approve(5000))).error).toBe('CHILD_NOT_FOUND');
      store = null;
      expect((await code(approve(5000))).error).toBe('CHILD_NOT_FOUND');
    });
  });

  describe('decline', () => {
    it('no money moves; the child is told with the note', async () => {
      await service.decline(parentId.toString(), String(pending._id), {
        note: 'Not today',
      });
      expect(wallet.transfer).not.toHaveBeenCalled();
      expect(boosts.addBoost).not.toHaveBeenCalled();
      expect(requests.transition).toHaveBeenCalledWith(
        pending._id,
        expect.objectContaining({
          status: 'declined',
          parentNote: 'Not today',
        }),
        session,
      );
      expect(events.notify).toHaveBeenCalledWith(
        childId.toString(),
        'allowance.requestResolved',
        expect.objectContaining({ status: 'declined', note: 'Not today' }),
        expect.anything(),
      );
    });

    it('a second answer → 409 REQUEST_ALREADY_RESOLVED', async () => {
      store = { ...pending, status: 'approved' };
      expect(
        (
          await code(
            service.decline(parentId.toString(), String(pending._id), {}),
          )
        ).error,
      ).toBe('REQUEST_ALREADY_RESOLVED');
    });
  });

  describe('expiry (FR-052)', () => {
    it('expires a still-pending request and tells the child', async () => {
      expect(await service.expire(String(pending._id))).toBe(true);
      expect(requests.transition).toHaveBeenCalledWith(
        pending._id,
        expect.objectContaining({ status: 'expired' }),
        session,
      );
      expect(events.notify).toHaveBeenCalledWith(
        childId.toString(),
        'allowance.requestExpired',
        { childId: childId.toString() },
        expect.anything(),
      );
    });

    it('does nothing if it was answered meanwhile', async () => {
      store = { ...pending, status: 'approved' };
      expect(await service.expire(String(pending._id))).toBe(false);
      requests.transition.mockResolvedValue(null);
      store = pending;
      expect(await service.expire(String(pending._id))).toBe(false);
      expect(events.notify).not.toHaveBeenCalled();
    });

    it('expireOverdue expires each overdue request and keeps going past a failure', async () => {
      const a = { ...pending, _id: new Types.ObjectId() };
      const b = { ...pending, _id: new Types.ObjectId() };
      requests.findOverdue.mockResolvedValue([a, b]);
      requests.findById.mockImplementation((id: Types.ObjectId | string) => {
        if (String(id) === String(a._id))
          return Promise.reject(new Error('db blip'));
        return Promise.resolve(b);
      });
      expect(await service.expireOverdue(new Date())).toBe(1);
    });
  });
});
