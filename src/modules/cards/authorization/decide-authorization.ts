import {
  ALWAYS_BLOCKED_CATEGORIES,
  CardStatus,
  DeclineReason,
} from '../../family-core/family-core.constants';

export interface AuthorizationSnapshot {
  cardStatus: CardStatus;
  category?: string;
  /** Blockable categories the parent chose; always-blocked ones are added here. */
  blockedCategories: readonly string[];
  amountHalalas: number;
  perPurchaseMaxHalalas: number;
  effectiveDailyLimitHalalas: number;
  spentTodayHalalas: number;
  balanceHalalas: number;
}

export type AuthorizationDecision =
  | { approved: true }
  | { approved: false; reason: DeclineReason };

/**
 * 026 (research R7, FR-040): the pure purchase decision. No I/O. The first
 * failing rule wins, in this order:
 *
 *  1. card `inactive`      → CARD_INACTIVE (an unlinked card)
 *  2. card `paused`        → CARD_PAUSED
 *  3. blocked category     → BLOCKED_CATEGORY (always-blocked ones included)
 *  4. over per-purchase    → OVER_PER_PURCHASE_LIMIT
 *  5. over daily left      → OVER_DAILY_LIMIT
 *  6. over the balance     → INSUFFICIENT_BALANCE
 *
 * `SERVICE_UNAVAILABLE` is only produced by the service wrapper. A non-positive
 * or non-integer amount is a programming error, not a decline, so it throws.
 */
export function decideAuthorization(
  s: AuthorizationSnapshot,
): AuthorizationDecision {
  if (!Number.isSafeInteger(s.amountHalalas) || s.amountHalalas <= 0) {
    throw new RangeError(
      `amountHalalas must be a positive safe integer, got ${s.amountHalalas}`,
    );
  }
  if (s.cardStatus === 'inactive') return decline(DeclineReason.CARD_INACTIVE);
  if (s.cardStatus === 'paused') return decline(DeclineReason.CARD_PAUSED);
  if (
    s.category !== undefined &&
    ((ALWAYS_BLOCKED_CATEGORIES as readonly string[]).includes(s.category) ||
      s.blockedCategories.includes(s.category))
  ) {
    return decline(DeclineReason.BLOCKED_CATEGORY);
  }
  if (s.amountHalalas > s.perPurchaseMaxHalalas)
    return decline(DeclineReason.OVER_PER_PURCHASE_LIMIT);
  if (s.amountHalalas > s.effectiveDailyLimitHalalas - s.spentTodayHalalas) {
    return decline(DeclineReason.OVER_DAILY_LIMIT);
  }
  if (s.amountHalalas > s.balanceHalalas)
    return decline(DeclineReason.INSUFFICIENT_BALANCE);
  return { approved: true };
}

function decline(reason: DeclineReason): AuthorizationDecision {
  return { approved: false, reason };
}
