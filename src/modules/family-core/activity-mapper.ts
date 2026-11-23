import { Types } from 'mongoose';
import {
  LedgerEntryDocument,
  EntryType,
  InitiatorKind,
} from '../wallet/schemas/ledger-entry.schema';
import { CardTransactionDocument } from './schemas/card-transaction.schema';
import { AllowanceRequestDocument } from './schemas/allowance-request.schema';
import { AllowancePayoutDocument } from './schemas/allowance-payout.schema';
import { ActivityItemDto } from './activity-item';

const base = {
  currency: 'SAR' as const,
  merchantName: null,
  category: null,
  declineReason: null,
  requestId: null,
  payoutId: null,
  note: null,
};

/** Approved purchase, declined purchase, refund and reversal rows (card_transactions). */
export function fromCardTransaction(
  tx: CardTransactionDocument,
): ActivityItemDto {
  const when = (tx.createdAt ?? new Date()).toISOString();
  const shared = {
    ...base,
    id: `ctx:${tx._id.toString()}`,
    occurredAt: when,
    amountHalalas: tx.amountHalalas,
    merchantName: tx.merchantName,
    category: tx.category ?? null,
    initiator: (tx.source === 'simulation'
      ? 'simulation'
      : 'child') as InitiatorKind,
  };
  if (tx.kind === 'refund')
    return { ...shared, kind: 'refund', direction: 'in' };
  if (tx.kind === 'reversal')
    return { ...shared, kind: 'purchase_reversal', direction: 'in' };
  if (tx.outcome === 'declined') {
    return {
      ...shared,
      kind: 'purchase_declined',
      direction: 'none',
      declineReason: tx.declineReason ?? null,
    };
  }
  return { ...shared, kind: 'purchase', direction: 'out' };
}

const LEDGER_KIND: Partial<
  Record<EntryType, { kind: ActivityItemDto['kind']; direction: 'in' | 'out' }>
> = {
  [EntryType.ALLOWANCE_PAYOUT]: { kind: 'allowance_payout', direction: 'in' },
  [EntryType.TOP_UP]: { kind: 'top_up', direction: 'in' },
  [EntryType.PULL_BACK]: { kind: 'pull_back', direction: 'out' },
  [EntryType.REQUEST_APPROVAL]: { kind: 'request_approved', direction: 'in' },
  [EntryType.UNLINK_RETURN]: { kind: 'unlink_return', direction: 'out' },
};

/** Ledger entry types that appear in the activity list directly (the card ones come from card_transactions). */
export const LEDGER_ACTIVITY_TYPES = Object.keys(LEDGER_KIND) as EntryType[];

export function fromLedgerEntry(
  entry: LedgerEntryDocument,
  note?: string | null,
): ActivityItemDto | null {
  const meta = LEDGER_KIND[entry.type];
  if (!meta) return null;
  return {
    ...base,
    id: `entry:${entry._id.toString()}`,
    occurredAt: (entry.createdAt ?? new Date()).toISOString(),
    kind: meta.kind,
    direction: meta.direction,
    amountHalalas: entry.amountHalalas,
    requestId: entry.refs?.requestId?.toString() ?? null,
    payoutId: entry.refs?.payoutId?.toString() ?? null,
    note: note ?? null,
    initiator: entry.initiator?.kind ?? 'system',
  };
}

export function fromRequest(
  request: AllowanceRequestDocument,
): ActivityItemDto | null {
  const kind =
    request.status === 'declined'
      ? 'request_declined'
      : request.status === 'expired'
        ? 'request_expired'
        : request.status === 'cancelled'
          ? 'request_cancelled'
          : null;
  if (!kind) return null;
  return {
    ...base,
    id: `req:${request._id.toString()}`,
    occurredAt: (
      request.resolvedAt ??
      request.createdAt ??
      new Date()
    ).toISOString(),
    kind,
    direction: 'none',
    amountHalalas: request.amountHalalas,
    requestId: request._id.toString(),
    note: request.parentNote ?? null,
    initiator:
      kind === 'request_declined'
        ? 'parent'
        : kind === 'request_cancelled'
          ? 'child'
          : 'system',
  };
}

export function fromFailedPayout(
  payout: AllowancePayoutDocument,
): ActivityItemDto {
  return {
    ...base,
    id: `pay:${payout._id.toString()}`,
    occurredAt: (
      payout.failedAt ??
      payout.createdAt ??
      new Date()
    ).toISOString(),
    kind: 'payout_failed',
    direction: 'none',
    amountHalalas: payout.amountHalalas,
    payoutId: payout._id.toString(),
    initiator: 'system',
  };
}

/** Sort key shared by every source: (createdAt desc, _id desc). */
export function sortKey(
  createdAt: Date | undefined,
  id: Types.ObjectId,
): { t: number; id: string } {
  return { t: (createdAt ?? new Date(0)).getTime(), id: id.toHexString() };
}
