import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet.module';
import { WalletDevController } from './wallet-dev.controller';

/** [DEV] Registered only when NODE_ENV !== 'production' (app.module.ts). */
@Module({
  imports: [WalletModule],
  controllers: [WalletDevController],
})
export class WalletDevModule {}
