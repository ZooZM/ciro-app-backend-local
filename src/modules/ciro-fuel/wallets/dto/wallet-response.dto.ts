import { WalletCurrency } from '../schemas/wallet.schema';

export class WalletResponseDto {
  balance: number;
  reservedBalance: number;
  availableBalance: number;
  currency: WalletCurrency;
}
