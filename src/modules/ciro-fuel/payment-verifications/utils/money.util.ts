/** Converts to thousandths (liters and unit prices use up to 3 decimals). */
export const toMilliUnits = (value: number): number => Math.round(value * 1000);

export const toCents = (amount: number): number => Math.round(amount * 100);

/**
 * liters × unit price in integer arithmetic, rounded half-up to cents.
 * milli-liters × milli-SAR = 1e-6 SAR, so 10_000 units = 1 cent.
 */
export function totalCents(liters: number, unitPrice: number): number {
  return Math.floor(
    (toMilliUnits(liters) * toMilliUnits(unitPrice) + 5_000) / 10_000,
  );
}
