import { nextRiyadhMidnightUtc } from '../../common/utils/riyadh-time.util';

/**
 * 026 data-model §3: derived summary values. Pure functions over integer
 * halalas; the spec "Definitions" section is the source of truth.
 */

export function effectiveDailyLimit(
  dailyLimitHalalas: number,
  boostHalalas: number,
): number {
  return dailyLimitHalalas + Math.max(0, boostHalalas);
}

/** `max(0, min(effective − spentToday, balance))`. */
export function availableToday(
  effectiveLimitHalalas: number,
  spentTodayHalalas: number,
  balanceHalalas: number,
): number {
  return Math.max(
    0,
    Math.min(effectiveLimitHalalas - spentTodayHalalas, balanceHalalas),
  );
}

/** `max(0, paidThisWindow − spentThisWindow)`; 0 when nothing was paid. */
export function leftThisMonth(
  paidHalalas: number,
  spentHalalas: number,
): number {
  if (paidHalalas <= 0) return 0;
  return Math.max(0, paidHalalas - spentHalalas);
}

/**
 * The complication's midnight projection (R9): at the next Riyadh midnight
 * spent-today and the boost both reset, so it is `min(dailyLimit, balance)`.
 */
export function nextDay(
  dailyLimitHalalas: number,
  balanceHalalas: number,
  now: Date,
): { startsAt: string; availableTodayHalalas: number } {
  return {
    startsAt: nextRiyadhMidnightUtc(now).toISOString(),
    availableTodayHalalas: Math.max(
      0,
      Math.min(dailyLimitHalalas, balanceHalalas),
    ),
  };
}
