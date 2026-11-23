import {
  addDays,
  addMonths,
  currentAllowanceWindow,
  effectivePayoutDate,
  nextRiyadhMidnightUtc,
  riyadhDate,
  riyadhDayStartUtc,
  riyadhHour,
  riyadhMonth,
} from './riyadh-time.util';

describe('riyadh-time.util (026, R5)', () => {
  describe('day boundaries', () => {
    it('23:59:59 Riyadh is still the same day', () => {
      // 2026-11-18 23:59:59 Riyadh = 20:59:59Z
      expect(riyadhDate(new Date('2026-11-18T20:59:59.000Z'))).toBe(
        '2026-11-18',
      );
    });

    it('00:00:00 Riyadh is the next day', () => {
      expect(riyadhDate(new Date('2026-11-18T21:00:00.000Z'))).toBe(
        '2026-11-19',
      );
    });

    it('a UTC instant whose UTC date is still yesterday is already the next Riyadh day', () => {
      const d = new Date('2026-12-31T22:30:00.000Z');
      expect(d.getUTCDate()).toBe(31);
      expect(riyadhDate(d)).toBe('2027-01-01');
      expect(riyadhMonth(d)).toBe('2027-01');
    });

    it('riyadhDayStartUtc is 21:00Z of the previous UTC day', () => {
      expect(riyadhDayStartUtc('2026-11-19').toISOString()).toBe(
        '2026-11-18T21:00:00.000Z',
      );
    });

    it('nextRiyadhMidnightUtc is strictly after now', () => {
      expect(
        nextRiyadhMidnightUtc(
          new Date('2026-11-18T15:04:05.000Z'),
        ).toISOString(),
      ).toBe('2026-11-18T21:00:00.000Z');
      expect(
        nextRiyadhMidnightUtc(
          new Date('2026-11-18T21:00:00.000Z'),
        ).toISOString(),
      ).toBe('2026-11-19T21:00:00.000Z');
    });
  });

  describe('riyadhHour', () => {
    it('is UTC+3', () => {
      expect(riyadhHour(new Date('2026-11-18T02:59:00Z'))).toBe(5);
      expect(riyadhHour(new Date('2026-11-18T03:00:00Z'))).toBe(6);
      expect(riyadhHour(new Date('2026-11-18T21:00:00Z'))).toBe(0);
    });
  });

  describe('calendar arithmetic', () => {
    it('addDays crosses month and year boundaries', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
      expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    });

    it('addMonths crosses year boundaries', () => {
      expect(addMonths('2026-12', 1)).toBe('2027-01');
      expect(addMonths('2027-01', -1)).toBe('2026-12');
      expect(addMonths('2026-11', 14)).toBe('2028-01');
    });
  });

  describe('effectivePayoutDate', () => {
    it('keeps a day that exists', () => {
      expect(effectivePayoutDate('2026-11', 15)).toBe('2026-11-15');
    });

    it('clamps day 31 to the last day of February, April and a leap February', () => {
      expect(effectivePayoutDate('2027-02', 31)).toBe('2027-02-28');
      expect(effectivePayoutDate('2028-02', 31)).toBe('2028-02-29');
      expect(effectivePayoutDate('2026-04', 31)).toBe('2026-04-30');
      expect(effectivePayoutDate('2027-02', 29)).toBe('2027-02-28');
    });

    it('rejects days outside 1..31', () => {
      expect(() => effectivePayoutDate('2026-11', 0)).toThrow();
      expect(() => effectivePayoutDate('2026-11', 32)).toThrow();
    });
  });

  describe('currentAllowanceWindow', () => {
    it('is the calendar month when there is no allowance', () => {
      expect(
        currentAllowanceWindow(null, new Date('2027-02-10T10:00:00Z')),
      ).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    });

    it('starts on this month’s payout date once it has arrived', () => {
      expect(
        currentAllowanceWindow(15, new Date('2026-11-18T10:00:00Z')),
      ).toEqual({ from: '2026-11-15', to: '2026-12-14' });
    });

    it('starts on last month’s payout date before this month’s arrives', () => {
      expect(
        currentAllowanceWindow(15, new Date('2026-11-10T10:00:00Z')),
      ).toEqual({ from: '2026-10-15', to: '2026-11-14' });
    });

    it('crosses the year boundary', () => {
      expect(
        currentAllowanceWindow(20, new Date('2027-01-05T10:00:00Z')),
      ).toEqual({ from: '2026-12-20', to: '2027-01-19' });
      expect(
        currentAllowanceWindow(20, new Date('2026-12-25T10:00:00Z')),
      ).toEqual({ from: '2026-12-20', to: '2027-01-19' });
    });

    it('uses clamped payout dates for day 31', () => {
      expect(
        currentAllowanceWindow(31, new Date('2027-02-28T10:00:00Z')),
      ).toEqual({ from: '2027-02-28', to: '2027-03-30' });
      expect(
        currentAllowanceWindow(31, new Date('2027-02-27T10:00:00Z')),
      ).toEqual({ from: '2027-01-31', to: '2027-02-27' });
    });

    it('uses the Riyadh date, not the UTC date', () => {
      // 2026-11-14 21:30Z is 2026-11-15 00:30 in Riyadh: payout day has arrived.
      expect(
        currentAllowanceWindow(15, new Date('2026-11-14T21:30:00Z')),
      ).toEqual({ from: '2026-11-15', to: '2026-12-14' });
    });
  });
});
