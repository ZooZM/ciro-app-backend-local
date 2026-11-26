import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletsRepository } from './wallets.repository';
import { WalletsService } from './wallets.service';
import { Wallet, WalletSchema } from './schemas/wallet.schema';

/**
 * Legacy Ciro Fuel wallet, kept only as the backing store for
 * CiroFuelPaymentsService (reserve/settle). It exposes no HTTP routes:
 * GET /wallet/me is served by the shared ledger (src/modules/wallet, 026 FR-026).
 * Remove once fuel payments run on LedgerService and the legacy `wallets`
 * collection is retired via src/scripts/migrate-fuel-wallets.ts.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Wallet.name, schema: WalletSchema }]),
  ],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService],
})
export class WalletsModule {}
