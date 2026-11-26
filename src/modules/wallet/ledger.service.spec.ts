import { Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { LedgerService, PostEntryInput } from './ledger.service';
import type { LedgerHealthService } from './ledger-health.service';
import type { LedgerAccountsRepository } from './repositories/ledger-accounts.repository';
import type { LedgerEntriesRepository } from './repositories/ledger-entries.repository';
import { EntryType } from './schemas/ledger-entry.schema';
import {
  AccountFrozenError,
  InsufficientBalanceError,
  LedgerInvariantError,
} from './ledger.errors';

describe('LedgerService (026, FR-020–023)', () => {
  const session = {} as ClientSession;
  const debitId = new Types.ObjectId();
  const creditId = new Types.ObjectId();

  let accounts: jest.Mocked<
    Pick<LedgerAccountsRepository, 'findById' | 'debit' | 'credit'>
  >;
  let entries: { findByIdempotencyKey: jest.Mock; insert: jest.Mock };
  let health: jest.Mocked<Pick<LedgerHealthService, 'assertAvailable'>>;
  let service: LedgerService;

  const account = (id: Types.ObjectId, over: Record<string, unknown> = {}) => ({
    _id: id,
    frozen: false,
    allowNegative: false,
    balanceHalalas: 10000,
    ...over,
  });

  const input = (over: Partial<PostEntryInput> = {}): PostEntryInput => ({
    type: EntryType.TOP_UP,
    debitAccountId: debitId,
    creditAccountId: creditId,
    amountHalalas: 2500,
    idempotencyKey: 'topup:k1',
    initiator: { kind: 'parent' },
    ...over,
  });

  beforeEach(() => {
    accounts = {
      findById: jest.fn((id: Types.ObjectId) =>
        Promise.resolve(account(id) as never),
      ),
      debit: jest.fn().mockResolvedValue(true),
      credit: jest.fn().mockResolvedValue(true),
    };
    entries = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      insert: jest.fn((e: unknown) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          ...(e as object),
        } as never),
      ),
    };
    health = { assertAvailable: jest.fn() };
    service = new LedgerService(
      {} as Connection,
      health as unknown as LedgerHealthService,
      accounts as unknown as LedgerAccountsRepository,
      entries as unknown as LedgerEntriesRepository,
    );
  });

  it('inserts the entry, debits with the guard and credits', async () => {
    const result = await service.post(input(), session);
    expect(result.replayed).toBe(false);
    expect(entries.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'topup:k1',
        amountHalalas: 2500,
        riyadhDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
      session,
    );
    expect(accounts.debit).toHaveBeenCalledWith(debitId, 2500, false, session);
    expect(accounts.credit).toHaveBeenCalledWith(creditId, 2500, session);
  });

  it('aborts when the $gte guard does not match', async () => {
    accounts.debit.mockResolvedValue(false);
    await expect(service.post(input(), session)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );
    expect(accounts.credit).not.toHaveBeenCalled();
  });

  it('lets system accounts with allowNegative go below zero', async () => {
    accounts.findById.mockImplementation((id) =>
      Promise.resolve(
        account(id as Types.ObjectId, {
          allowNegative: (id as Types.ObjectId).equals(debitId),
        }) as never,
      ),
    );
    await service.post(input(), session);
    expect(accounts.debit).toHaveBeenCalledWith(debitId, 2500, true, session);
  });

  it.each(['debit', 'credit'])(
    'rejects a frozen %s account (FR-008)',
    async (side) => {
      const frozenId = side === 'debit' ? debitId : creditId;
      accounts.findById.mockImplementation((id) =>
        Promise.resolve(
          account(id as Types.ObjectId, {
            frozen: (id as Types.ObjectId).equals(frozenId),
          }) as never,
        ),
      );
      await expect(service.post(input(), session)).rejects.toBeInstanceOf(
        AccountFrozenError,
      );
      expect(entries.insert).not.toHaveBeenCalled();
    },
  );

  it('returns the existing entry for a duplicate idempotency key and writes nothing', async () => {
    const existing = { _id: new Types.ObjectId(), idempotencyKey: 'topup:k1' };
    entries.findByIdempotencyKey.mockResolvedValue(existing as never);
    const result = await service.post(input(), session);
    expect(result).toEqual({ entry: existing, replayed: true });
    expect(entries.insert).not.toHaveBeenCalled();
    expect(accounts.debit).not.toHaveBeenCalled();
    expect(accounts.credit).not.toHaveBeenCalled();
  });

  it.each([0, -100, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'throws for amount %p',
    async (amount) => {
      await expect(
        service.post(input({ amountHalalas: amount }), session),
      ).rejects.toBeInstanceOf(LedgerInvariantError);
      expect(entries.insert).not.toHaveBeenCalled();
    },
  );

  it('throws when both sides are the same account', async () => {
    await expect(
      service.post(input({ creditAccountId: debitId }), session),
    ).rejects.toBeInstanceOf(LedgerInvariantError);
  });

  it('refuses to start a transaction when the ledger is unavailable', async () => {
    health.assertAvailable.mockImplementation(() => {
      throw new Error('LEDGER_UNAVAILABLE');
    });
    await expect(
      service.runInTransaction(() => Promise.resolve(1)),
    ).rejects.toThrow('LEDGER_UNAVAILABLE');
  });
});
