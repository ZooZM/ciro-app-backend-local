export enum PaymentVerificationStatus {
  NFC_SCANNED = 'nfc-scanned',
  DASHBOARD_BEFORE_FUELING = 'dashboard-before-fueling',
  PUMP_READING_CAPTURED = 'pump-reading-captured',
  DASHBOARD_AFTER_FUELING = 'dashboard-after-fueling',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}
