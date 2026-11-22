import type { JobsOptions } from 'bullmq';

export const CIRO_FUEL_PAYMENT_QUEUE = 'ciro-fuel-payment';
export const CIRO_FUEL_PAYMENT_JOB = 'process-payment';
// move to env vars keep values as default
export const CIRO_FUEL_PAYMENT_SWEEP_INTERVAL_MS = Number(
  process.env.CIRO_FUEL_PAYMENT_SWEEP_INTERVAL_MS ?? 2 * 60 * 1000,
);
export const CIRO_FUEL_PAYMENT_PROCESSING_LEASE_MS = Number(
  process.env.CIRO_FUEL_PAYMENT_PROCESSING_LEASE_MS ?? 5 * 60 * 1000,
);
const attempts = Number(process.env.PAYMENT_JOB_ATTEMPTS ?? 5);

export function paymentJobOptions(transactionId: string): JobsOptions {
  return {
    jobId: `ciro-fuel-payment-${transactionId}`,
    attempts,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: true,
  };
}
