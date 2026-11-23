import {
  AuthorizationSnapshot,
  decideAuthorization,
} from './decide-authorization';
import { DeclineReason } from '../../family-core/family-core.constants';

/** Table tests for US2-1..6 and the FR-040 ordering (026, research R7). */
describe('decideAuthorization (026, FR-040)', () => {
  const ok: AuthorizationSnapshot = {
    cardStatus: 'active',
    category: 'food_dining',
    blockedCategories: [],
    amountHalalas: 2000,
    perPurchaseMaxHalalas: 3000,
    effectiveDailyLimitHalalas: 5000,
    spentTodayHalalas: 0,
    balanceHalalas: 10000,
  };
  const decide = (over: Partial<AuthorizationSnapshot>) =>
    decideAuthorization({ ...ok, ...over });
  const reason = (over: Partial<AuthorizationSnapshot>) => {
    const d = decide(over);
    return d.approved ? 'APPROVED' : d.reason;
  };

  it.each<[string, Partial<AuthorizationSnapshot>, string]>([
    ['US2-1 within every limit', {}, 'APPROVED'],
    [
      'US2-2 over the per-purchase maximum',
      { amountHalalas: 3001 },
      DeclineReason.OVER_PER_PURCHASE_LIMIT,
    ],
    [
      'US2-3 over what is left of the daily limit',
      { spentTodayHalalas: 4000, amountHalalas: 1500 },
      DeclineReason.OVER_DAILY_LIMIT,
    ],
    [
      'US2-4 blocked category',
      { blockedCategories: ['food_dining'] },
      DeclineReason.BLOCKED_CATEGORY,
    ],
    [
      'US2-5 always-blocked category',
      { category: 'gambling' },
      DeclineReason.BLOCKED_CATEGORY,
    ],
    [
      'US2-5 always-blocked: alcohol_tobacco',
      { category: 'alcohol_tobacco' },
      DeclineReason.BLOCKED_CATEGORY,
    ],
    [
      'US2-5 always-blocked: adult',
      { category: 'adult' },
      DeclineReason.BLOCKED_CATEGORY,
    ],
    [
      'US2-6 not enough balance',
      { balanceHalalas: 1500 },
      DeclineReason.INSUFFICIENT_BALANCE,
    ],
    ['paused card', { cardStatus: 'paused' }, DeclineReason.CARD_PAUSED],
    [
      'inactive card (unlinked)',
      { cardStatus: 'inactive' },
      DeclineReason.CARD_INACTIVE,
    ],
  ])('%s', (_name, over, expected) => {
    expect(reason(over)).toBe(expected);
  });

  describe('boundaries', () => {
    it('a purchase exactly equal to the daily limit left is approved; one halala more is declined', () => {
      expect(reason({ spentTodayHalalas: 3000, amountHalalas: 2000 })).toBe(
        'APPROVED',
      );
      expect(reason({ spentTodayHalalas: 3000, amountHalalas: 2001 })).toBe(
        DeclineReason.OVER_DAILY_LIMIT,
      );
    });

    it('exactly the per-purchase maximum is approved; one halala more is declined', () => {
      expect(reason({ amountHalalas: 3000 })).toBe('APPROVED');
      expect(reason({ amountHalalas: 3001 })).toBe(
        DeclineReason.OVER_PER_PURCHASE_LIMIT,
      );
    });

    it('exactly the balance is approved; one halala more is declined', () => {
      expect(reason({ balanceHalalas: 2000 })).toBe('APPROVED');
      expect(reason({ balanceHalalas: 1999 })).toBe(
        DeclineReason.INSUFFICIENT_BALANCE,
      );
    });

    it('a limit lowered below what was spent today declines as OVER_DAILY_LIMIT', () => {
      expect(
        reason({ effectiveDailyLimitHalalas: 2500, spentTodayHalalas: 4000 }),
      ).toBe(DeclineReason.OVER_DAILY_LIMIT);
    });

    it('approves a purchase with no category (real issuers before MCC mapping)', () => {
      expect(
        reason({ category: undefined, blockedCategories: ['food_dining'] }),
      ).toBe('APPROVED');
    });
  });

  describe('FR-040 order when several rules fail at once', () => {
    const everythingWrong: Partial<AuthorizationSnapshot> = {
      cardStatus: 'paused',
      category: 'gambling',
      amountHalalas: 9000,
      spentTodayHalalas: 5000,
      balanceHalalas: 100,
    };

    it('walks down the list as each earlier failure is removed', () => {
      expect(reason(everythingWrong)).toBe(DeclineReason.CARD_PAUSED);
      expect(reason({ ...everythingWrong, cardStatus: 'active' })).toBe(
        DeclineReason.BLOCKED_CATEGORY,
      );
      expect(
        reason({
          ...everythingWrong,
          cardStatus: 'active',
          category: 'food_dining',
        }),
      ).toBe(DeclineReason.OVER_PER_PURCHASE_LIMIT);
      expect(
        reason({
          ...everythingWrong,
          cardStatus: 'active',
          category: 'food_dining',
          perPurchaseMaxHalalas: 99999,
        }),
      ).toBe(DeclineReason.OVER_DAILY_LIMIT);
      expect(
        reason({
          ...everythingWrong,
          cardStatus: 'active',
          category: 'food_dining',
          perPurchaseMaxHalalas: 99999,
          effectiveDailyLimitHalalas: 99999,
        }),
      ).toBe(DeclineReason.INSUFFICIENT_BALANCE);
    });

    it('inactive beats paused-like reasons', () => {
      expect(reason({ ...everythingWrong, cardStatus: 'inactive' })).toBe(
        DeclineReason.CARD_INACTIVE,
      );
    });

    it('limit check (5) runs before the balance check (6)', () => {
      expect(
        reason({
          spentTodayHalalas: 4500,
          amountHalalas: 2000,
          balanceHalalas: 100,
        }),
      ).toBe(DeclineReason.OVER_DAILY_LIMIT);
    });
  });

  describe('invalid amounts are a programming error, not a decline', () => {
    it.each([0, -1, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
      'throws for %p',
      (amount) => {
        expect(() => decide({ amountHalalas: amount })).toThrow(RangeError);
      },
    );
  });
});
