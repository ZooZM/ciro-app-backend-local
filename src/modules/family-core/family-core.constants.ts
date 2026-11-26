/** 026 data-model §1.4–1.8: shared allowance vocabulary. */

export const BLOCKABLE_CATEGORIES = [
  'food_dining',
  'groceries',
  'transport',
  'entertainment',
  'gaming',
  'shopping',
  'online',
  'education',
  'health',
] as const;

/** FR-011: implicit in every child's settings; parents cannot unblock them. */
export const ALWAYS_BLOCKED_CATEGORIES = [
  'gambling',
  'alcohol_tobacco',
  'adult',
] as const;

export type BlockableCategory = (typeof BLOCKABLE_CATEGORIES)[number];
export type AlwaysBlockedCategory = (typeof ALWAYS_BLOCKED_CATEGORIES)[number];
export type SpendingCategory = BlockableCategory | AlwaysBlockedCategory;

export const SPENDING_CATEGORIES: SpendingCategory[] = [
  ...BLOCKABLE_CATEGORIES,
  ...ALWAYS_BLOCKED_CATEGORIES,
];

export function isAlwaysBlocked(category: string): boolean {
  return (ALWAYS_BLOCKED_CATEGORIES as readonly string[]).includes(category);
}

/** FR-043, research R7 (in decision order). */
export enum DeclineReason {
  CARD_INACTIVE = 'CARD_INACTIVE',
  CARD_PAUSED = 'CARD_PAUSED',
  BLOCKED_CATEGORY = 'BLOCKED_CATEGORY',
  OVER_PER_PURCHASE_LIMIT = 'OVER_PER_PURCHASE_LIMIT',
  OVER_DAILY_LIMIT = 'OVER_DAILY_LIMIT',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export const REQUEST_STATUSES = [
  'pending',
  'approved',
  'partially_approved',
  'declined',
  'expired',
  'cancelled',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_REASONS = [
  'food',
  'transport',
  'school',
  'other',
] as const;
export type RequestReason = (typeof REQUEST_REASONS)[number];

export const REQUEST_SOURCES = ['phone', 'watch'] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export const CARD_STATUSES = ['active', 'paused', 'inactive'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** contracts/rest-api.md ActivityItem.kind (13). */
export const ACTIVITY_KINDS = [
  'purchase',
  'purchase_declined',
  'refund',
  'purchase_reversal',
  'allowance_payout',
  'payout_failed',
  'top_up',
  'pull_back',
  'request_approved',
  'request_declined',
  'request_expired',
  'request_cancelled',
  'unlink_return',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** contracts/socket-events.md `allowanceUpdated.reason`. */
export type SummaryChangeReason =
  | 'purchase'
  | 'purchase_declined'
  | 'refund'
  | 'purchase_reversal'
  | 'payout'
  | 'payout_failed'
  | 'top_up'
  | 'pull_back'
  | 'request_approved'
  | 'settings'
  | 'card_paused'
  | 'card_resumed'
  | 'linked'
  | 'unlinked';

/** Product defaults on link creation (data-model §1.4), editable right after linking. */
export const ALLOWANCE_DEFAULTS = {
  monthlyAmountHalalas: 0,
  payoutDay: 1,
  dailyLimitHalalas: 5000,
  perPurchaseMaxHalalas: 5000,
  blockedCategories: [] as BlockableCategory[],
  purchaseNotifications: true,
};

/** FR-005. */
export const MAX_CHILDREN_PER_PARENT = 10;

/** FR-052. */
export const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

/** Redis TTL for spend counters, compensation markers and reminder markers. */
export const TWO_DAYS_SECONDS = 172_800;
