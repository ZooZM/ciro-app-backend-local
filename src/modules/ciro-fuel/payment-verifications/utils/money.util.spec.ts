import { toCents, totalCents } from './money.util';

describe('money util', () => {
  it('matches the screenshot example (41.20 L × 2.18 = 89.82)', () => {
    expect(totalCents(41.2, 2.18)).toBe(8982);
  });

  it('rounds half a cent up', () => {
    expect(totalCents(0.5, 0.01)).toBe(1); // 0.005 SAR
    expect(totalCents(1.005, 1)).toBe(101); // 100.5 cents
  });

  it('handles exact values', () => {
    expect(totalCents(10, 2.18)).toBe(2180);
  });

  it('converts submitted totals to cents without float drift', () => {
    expect(toCents(89.82)).toBe(8982);
    expect(toCents(1.15)).toBe(115);
  });
});
