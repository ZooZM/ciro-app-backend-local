import { WalletCurrency } from '../schemas/wallet.schema';

export class WalletResponseDto {
  balance: number;
  currency: WalletCurrency;
}
