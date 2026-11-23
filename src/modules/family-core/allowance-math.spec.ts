import {
  availableToday,
  effectiveDailyLimit,
  leftThisMonth,
  nextDay,
} from './allowance-math';

describe('allowance-math (026, data-model §3)', () => {
  it('effective limit adds today’s boost', () => {
    expect(effectiveDailyLimit(4000, 5000)).toBe(9000);
    expect(effectiveDailyLimit(4000, 0)).toBe(4000);
  });

  it('a limit lowered below what was spent gives 0 available', () => {
    expect(availableToday(3000, 4000, 10000)).toBe(0);
  });

  it('spending exactly the limit leaves 0', () => {
    expect(availableToday(5000, 5000, 10000)).toBe(0);
  });

  it('available is capped by the balance', () => {
    expect(availableToday(5000, 1000, 2500)).toBe(2500);
    expect(availableToday(5000, 1000, 0)).toBe(0);
  });

  it('nothing paid means 0 left this month', () => {
    expect(leftThisMonth(0, 0)).toBe(0);
    expect(leftThisMonth(0, 500)).toBe(0);
  });

  it('left this month never goes below 0', () => {
    expect(leftThisMonth(30000, 12500)).toBe(17500);
    expect(leftThisMonth(30000, 40000)).toBe(0);
  });

  it('US3-7 carry-over: 40.00 unspent + 300.00 payout → balance 340.00, left 300.00', () => {
    const balance = 4000 + 30000;
    expect(balance).toBe(34000);
    expect(leftThisMonth(30000, 0)).toBe(30000);
    expect(availableToday(50000, 0, balance)).toBe(34000);
  });

  it('nextDay is min(dailyLimit, balance) at the next Riyadh midnight', () => {
    const now = new Date('2026-11-18T15:04:05.000Z');
    expect(nextDay(5000, 17500, now)).toEqual({
      startsAt: '2026-11-18T21:00:00.000Z',
      availableTodayHalalas: 5000,
    });
    expect(nextDay(5000, 1200, now).availableTodayHalalas).toBe(1200);
  });
});
