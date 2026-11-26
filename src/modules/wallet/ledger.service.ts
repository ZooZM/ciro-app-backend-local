import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { riyadhDate } from '../../common/utils/riyadh-time.util';
import { LedgerHealthService } from './ledger-health.service';
import { LedgerAccountsRepository } from './repositories/ledger-accounts.repository';
import { LedgerEntriesRepository } from './repositories/ledger-entries.repository';
import {
  EntryInitiator,
  EntryRefs,
  EntryType,
  LedgerEntryDocument,
} from './schemas/ledger-entry.schema';
import {
  AccountFrozenError,
  InsufficientBalanceError,
  LedgerInvariantError,
  isDuplicateKeyError,
} from './ledger.errors';

export interface PostEntryInput {
  type: EntryType;
  debitAccountId: Types.ObjectId;
  creditAccountId: Types.ObjectId;
  amountHalalas: number;
  idempotencyKey: string;
  initiator: EntryInitiator;
  refs?: EntryRefs;
  /** Defaults to the Riyadh date of now. */
  riyadhDate?: string;
}

export interface PostResult {
  entry: LedgerEntryDocument;
  /** True when the idempotency key already existed and nothing new was written. */
  replayed: boolean;
}

/** Attempts when a concurrent transaction committed the same idempotency key first. */
const DUPLICATE_KEY_ATTEMPTS = 3;

/**
 * 026 (FR-020–023, research R2): the double-entry ledger. Every movement is
 * one immutable entry plus guarded `$inc`s on both cached balances, inside a
 * single MongoDB transaction.
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly health: LedgerHealthService,
    private readonly accounts: LedgerAccountsRepository,
    private readonly entries: LedgerEntriesRepository,
  ) {}

  /**
   * Runs `fn` in one transaction. `withTransaction` retries transient errors
   * (write conflicts between concurrent movements on the same account), so
   * `fn` must only write through `session` and must not have side effects
   * outside the database. Events and pushes go after this resolves.
   */
  async runInTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    this.health.assertAvailable();
    for (let attempt = 1; ; attempt++) {
      const session = await this.connection.startSession();
      try {
        let result!: T;
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return result;
      } catch (err) {
        if (
          attempt < DUPLICATE_KEY_ATTEMPTS &&
          isDuplicateKeyError(err, 'idempotencyKey')
        ) {
          continue;
        }
        throw err;
      } finally {
        await session.endSession();
      }
    }
  }

  /**
   * Posts one entry inside the caller's transaction. On a duplicate
   * idempotency key it returns the existing entry and writes nothing.
   */
  async post(
    input: PostEntryInput,
    session: ClientSession,
  ): Promise<PostResult> {
    const { amountHalalas: amount } = input;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new LedgerInvariantError(
        `amountHalalas must be a positive safe integer, got ${amount}`,
      );
    }
    if (input.debitAccountId.equals(input.creditAccountId)) {
      throw new LedgerInvariantError('debit and credit accounts must differ');
    }

    const existing = await this.entries.findByIdempotencyKey(
      input.idempotencyKey,
      session,
    );
    if (existing) return { entry: existing, replayed: true };

    const [debit, credit] = await Promise.all([
      this.accounts.findById(input.debitAccountId, session),
      this.accounts.findById(input.creditAccountId, session),
    ]);
    if (!debit || !credit) {
      throw new LedgerInvariantError('ledger account not found');
    }
    if (debit.frozen) throw new AccountFrozenError(debit._id);
    if (credit.frozen) throw new AccountFrozenError(credit._id);

    const entry = await this.entries.insert(
      {
        idempotencyKey: input.idempotencyKey,
        type: input.type,
        amountHalalas: amount,
        debitAccountId: debit._id,
        creditAccountId: credit._id,
        initiator: input.initiator,
        refs: input.refs ?? {},
        riyadhDate: input.riyadhDate ?? riyadhDate(new Date()),
      },
      session,
    );

    if (
      !(await this.accounts.debit(
        debit._id,
        amount,
        debit.allowNegative,
        session,
      ))
    ) {
      throw new InsufficientBalanceError(debit._id);
    }
    if (!(await this.accounts.credit(credit._id, amount, session))) {
      throw new AccountFrozenError(credit._id);
    }
    return { entry, replayed: false };
  }
}
