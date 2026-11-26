/**
 * 026 (research R5): Asia/Riyadh calendar helpers. Saudi Arabia has no DST,
 * so day boundaries are fixed UTC+3 arithmetic. Dates are `YYYY-MM-DD`
 * strings and months are `YYYY-MM` strings, both in Riyadh time.
 */

export const RIYADH_TZ = 'Asia/Riyadh';
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: RIYADH_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface AllowanceWindow {
  /** First Riyadh date of the window (inclusive). */
  from: string;
  /** Last Riyadh date of the window (inclusive). */
  to: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid Riyadh date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function parseMonth(month: string): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

export function riyadhDate(d: Date): string {
  return dateFormatter.format(d);
}

export function riyadhMonth(d: Date): string {
  return riyadhDate(d).slice(0, 7);
}

/** Hour of day (0–23) in Asia/Riyadh. */
export function riyadhHour(d: Date): number {
  return new Date(d.getTime() + RIYADH_OFFSET_MS).getUTCHours();
}

export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(month: string): number {
  const { y, m } = parseMonth(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, n: number): string {
  const { y, m } = parseMonth(month);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** UTC instant of 00:00 Asia/Riyadh on `date`. */
export function riyadhDayStartUtc(date: string): Date {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d) - RIYADH_OFFSET_MS);
}

/** UTC instant of the next 00:00 Asia/Riyadh strictly after `d`. */
export function nextRiyadhMidnightUtc(d: Date): Date {
  return riyadhDayStartUtc(addDays(riyadhDate(d), 1));
}

/** Payout date for `month`; days 29–31 clamp to the month's last day. */
export function effectivePayoutDate(month: string, payoutDay: number): string {
  if (!Number.isInteger(payoutDay) || payoutDay < 1 || payoutDay > 31) {
    throw new Error(`Invalid payout day: ${payoutDay}`);
  }
  const day = Math.min(payoutDay, daysInMonth(month));
  return `${month}-${pad2(day)}`;
}

/**
 * The allowance month that contains `now`: from the latest payout date on or
 * before today to the day before the next payout date. With no allowance
 * (`payoutDay` null) it is the calendar month.
 */
export function currentAllowanceWindow(
  payoutDay: number | null,
  now: Date,
): AllowanceWindow {
  const today = riyadhDate(now);
  const month = monthOfDate(today);
  if (payoutDay === null) {
    return { from: `${month}-01`, to: `${month}-${pad2(daysInMonth(month))}` };
  }
  const thisPayout = effectivePayoutDate(month, payoutDay);
  if (today >= thisPayout) {
    const next = effectivePayoutDate(addMonths(month, 1), payoutDay);
    return { from: thisPayout, to: addDays(next, -1) };
  }
  const previous = effectivePayoutDate(addMonths(month, -1), payoutDay);
  return { from: previous, to: addDays(thisPayout, -1) };
}
