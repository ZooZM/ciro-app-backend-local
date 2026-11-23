import { Types } from 'mongoose';

/**
 * Domain errors raised inside a ledger transaction. They abort the
 * transaction; each caller maps them to its own API error code
 * (`INSUFFICIENT_FUNDS`, `AMOUNT_EXCEEDS_CHILD_BALANCE`, `INSUFFICIENT_BALANCE`…).
 */
export class InsufficientBalanceError extends Error {
  constructor(readonly accountId: Types.ObjectId) {
    super(`Insufficient balance on ledger account ${accountId.toString()}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class AccountFrozenError extends Error {
  constructor(readonly accountId: Types.ObjectId) {
    super(`Ledger account ${accountId.toString()} is frozen (FR-008)`);
    this.name = 'AccountFrozenError';
  }
}

/** A programming error (bad amount, same account on both sides, missing account). */
export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerInvariantError';
  }
}

export function isDuplicateKeyError(err: unknown, field?: string): boolean {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (e?.code !== 11000) return false;
  return field ? Boolean(e.keyPattern && field in e.keyPattern) : true;
}
