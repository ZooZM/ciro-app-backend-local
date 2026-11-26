import { Types } from 'mongoose';
import {
  assertIntegerBalances,
  legacyCollectionName,
  openingKey,
  parseMode,
  verifyMigration,
  LegacyWallet,
  OpeningEntry,
} from './migrate-fuel-wallets';

describe('migrate-fuel-wallets (026, R16, FR-025, SC-011)', () => {
  const w = (
    balance: number,
    id = new Types.ObjectId(),
    owner = new Types.ObjectId(),
  ): LegacyWallet => ({ _id: id, ownerId: owner, balance });
  const opening = (
    wallet: LegacyWallet,
    amount = wallet.balance,
  ): OpeningEntry => ({
    idempotencyKey: openingKey(wallet._id),
    amountHalalas: amount,
  });
  const shared = (...pairs: [LegacyWallet, number][]) =>
    new Map(pairs.map(([l, b]) => [String(l.ownerId), b]));

  describe('parseMode', () => {
    it.each(['dry-run', 'apply', 'verify', 'retire-legacy'])(
      'accepts --%s',
      (m) => {
        expect(parseMode([`--${m}`])).toBe(m);
      },
    );
    it('requires exactly one mode', () => {
      expect(() => parseMode([])).toThrow();
      expect(() => parseMode(['--apply', '--verify'])).toThrow();
      expect(() => parseMode(['--nope'])).toThrow();
    });
  });

  describe('assertIntegerBalances', () => {
    it('passes whole non-negative balances', () => {
      expect(() =>
        assertIntegerBalances([w(0), w(100), w(1_234_500)]),
      ).not.toThrow();
    });
    it.each([12.5, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
      'aborts on %p',
      (bad) => {
        expect(() => assertIntegerBalances([w(100), w(bad)])).toThrow(
          /not a non-negative integer/,
        );
      },
    );
  });

  describe('verifyMigration', () => {
    it('passes when every opening equals the legacy balance and the shared wallet holds at least that', () => {
      const a = w(1500);
      const b = w(250);
      const zero = w(0);
      const r = verifyMigration(
        [a, b, zero],
        [opening(a), opening(b)],
        shared([a, 1500], [b, 900]),
      );
      expect(r).toMatchObject({
        ok: true,
        legacyWallets: 3,
        legacyTotalHalalas: 1750,
        openingTotalHalalas: 1750,
        differences: [],
      });
    });

    it('flags a missing opening entry', () => {
      const a = w(1500);
      const r = verifyMigration([a], [], shared([a, 0]));
      expect(r.ok).toBe(false);
      expect(r.differences[0]).toMatchObject({
        problem: 'opening_entry_missing',
        legacyHalalas: 1500,
      });
    });

    it('flags an opening that differs from the legacy balance by even one halala', () => {
      const a = w(1500);
      const r = verifyMigration([a], [opening(a, 1499)], shared([a, 1499]));
      expect(r.differences[0]).toMatchObject({
        problem: 'opening_total_differs',
        legacyHalalas: 1500,
        openingHalalas: 1499,
      });
    });

    it('flags a shared wallet that holds less than the legacy balance', () => {
      const a = w(1500);
      const r = verifyMigration([a], [opening(a)], shared([a, 1000]));
      expect(r.differences[0]).toMatchObject({
        problem: 'shared_balance_below_legacy',
        sharedBalanceHalalas: 1000,
      });
    });

    it('flags opening entries that do not belong to any legacy wallet (the totals must match exactly)', () => {
      const a = w(1500);
      const stray: OpeningEntry = {
        idempotencyKey: 'fuel-migration:someone-else',
        amountHalalas: 300,
      };
      const r = verifyMigration([a], [opening(a), stray], shared([a, 1500]));
      expect(r.ok).toBe(false);
      expect(r.differences[0]).toMatchObject({
        walletId: '*',
        legacyHalalas: 1500,
        openingHalalas: 1800,
      });
    });

    it('an empty legacy set verifies trivially', () => {
      expect(verifyMigration([], [], new Map()).ok).toBe(true);
    });
  });

  it('names the retired collection by UTC date', () => {
    expect(legacyCollectionName(new Date('2026-11-18T22:00:00Z'))).toBe(
      'legacy_fuel_wallets_20261118',
    );
  });

  it('opening keys follow the data-model format', () => {
    expect(openingKey('abc')).toBe('fuel-migration:abc');
  });
});
