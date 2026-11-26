import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { LedgerService, PostResult } from './ledger.service';
import { LedgerAccountsRepository } from './repositories/ledger-accounts.repository';
import {
  LedgerAccountDocument,
  SYSTEM_ACCOUNT_CODES,
  SystemAccountCode,
} from './schemas/ledger-account.schema';
import { LedgerHealthService } from './ledger-health.service';
import {
  EntryInitiator,
  EntryRefs,
  EntryType,
} from './schemas/ledger-entry.schema';

export interface TransferInput {
  type: EntryType;
  fromAccountId: Types.ObjectId;
  toAccountId: Types.ObjectId;
  amountHalalas: number;
  idempotencyKey: string;
  initiator: EntryInitiator;
  refs?: EntryRefs;
  riyadhDate?: string;
}

/**
 * 026 (FR-024, research R16): the shared Ciro wallet. These are the only
 * money APIs other modules may call; nothing else writes `ledger_accounts`
 * or `ledger_entries`.
 */
@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new Logger(WalletService.name);
  private readonly systemAccountIds = new Map<
    SystemAccountCode,
    Types.ObjectId
  >();

  constructor(
    private readonly ledger: LedgerService,
    private readonly accounts: LedgerAccountsRepository,
    private readonly health: LedgerHealthService,
  ) {}

  /**
   * System accounts are created up front, outside any transaction: one
   * created inside a transaction's snapshot window would be invisible to it.
   */
  async onModuleInit(): Promise<void> {
    if (!(await this.health.ready())) return;
    try {
      for (const code of SYSTEM_ACCOUNT_CODES)
        await this.getSystemAccount(code);
    } catch (err) {
      this.logger.warn(
        `Could not create system accounts: ${(err as Error).message}`,
      );
    }
  }

  getOrCreateUserWallet(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument> {
    return this.accounts.upsertOwned('user_wallet', userId, session);
  }

  findUserWallet(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument | null> {
    return this.accounts.findOwned('user_wallet', userId, session);
  }

  /**
   * The child's `child_balance` account. A relinked child reuses the account
   * from an earlier link; unlink always returns its whole balance, so it
   * starts again from 0.
   */
  async createChildAccount(
    childUserId: string | Types.ObjectId,
    session: ClientSession,
  ): Promise<LedgerAccountDocument> {
    const account = await this.accounts.upsertOwned(
      'child_balance',
      childUserId,
      session,
    );
    if (account.frozen) {
      await this.accounts.setFrozen(account._id, false, session);
      account.frozen = false;
    }
    return account;
  }

  findChildAccount(
    childUserId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument | null> {
    return this.accounts.findOwned('child_balance', childUserId, session);
  }

  async getSystemAccount(code: SystemAccountCode): Promise<Types.ObjectId> {
    const cached = this.systemAccountIds.get(code);
    if (cached) return cached;
    const account = await this.accounts.upsertSystem(code);
    this.systemAccountIds.set(code, account._id);
    return account._id;
  }

  getAccount(
    accountId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument | null> {
    return this.accounts.findById(accountId, session);
  }

  async getBalance(
    accountId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const account = await this.accounts.findById(accountId, session);
    return account?.balanceHalalas ?? 0;
  }

  setFrozen(
    accountId: Types.ObjectId,
    frozen: boolean,
    session: ClientSession,
  ): Promise<void> {
    return this.accounts.setFrozen(accountId, frozen, session);
  }

  transfer(input: TransferInput, session: ClientSession): Promise<PostResult> {
    return this.ledger.post(
      {
        type: input.type,
        debitAccountId: input.fromAccountId,
        creditAccountId: input.toAccountId,
        amountHalalas: input.amountHalalas,
        idempotencyKey: input.idempotencyKey,
        initiator: input.initiator,
        refs: input.refs,
        riyadhDate: input.riyadhDate,
      },
      session,
    );
  }

  runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.ledger.runInTransaction(fn);
  }
}
