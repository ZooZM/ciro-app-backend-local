import { join } from 'path';
import { PaymentVerificationStatus } from '../enum/payment-verification-status.enum';

export const PAYMENT_VERIFICATION_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  'payment-verification',
);

export const PAYMENT_VERIFICATION_SESSION_TTL_MS = 30 * 60 * 1000;

export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const IMAGE_CONTENT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_EXTENSIONS).map(([mime, ext]) => [ext, mime]),
);

/** Non-terminal statuses: at most one of these may exist per car. */
export const ACTIVE_PAYMENT_VERIFICATION_STATUSES = [
  PaymentVerificationStatus.NFC_SCANNED,
  PaymentVerificationStatus.DASHBOARD_BEFORE_FUELING,
  PaymentVerificationStatus.PUMP_READING_CAPTURED,
  PaymentVerificationStatus.DASHBOARD_AFTER_FUELING,
];
