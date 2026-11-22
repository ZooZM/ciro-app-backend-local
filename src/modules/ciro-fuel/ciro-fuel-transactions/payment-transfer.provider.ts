import { WalletCurrency } from '../wallets/schemas/wallet.schema';

export const CIRO_FUEL_TRANSFER_PROVIDER = Symbol(
  'CIRO_FUEL_TRANSFER_PROVIDER',
);

export interface CiroFuelTransferRequest {
  sourceCardReference: string;
  destinationCardReference: string;
  amountMinor: number;
  currency: WalletCurrency;
  idempotencyKey: string;
}

export interface CiroFuelTransferResult {
  providerReference: string;
}

export interface CiroFuelTransferProvider {
  transfer(request: CiroFuelTransferRequest): Promise<CiroFuelTransferResult>;
}
