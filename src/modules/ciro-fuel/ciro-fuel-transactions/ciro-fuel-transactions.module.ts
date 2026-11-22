import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';
import { CiroFuelTransactionsController } from './ciro-fuel-transactions.controller';
import {
  CiroFuelTransaction,
  CiroFuelTransactionSchema,
} from './schemas/ciro-fuel-transaction.schema';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { TransactionsModule } from '../../transactions/transactions.module';
import { WalletsModule } from '../wallets/wallets.module';
import { CIRO_FUEL_PAYMENT_QUEUE } from './ciro-fuel-payment.constants';
import { CiroFuelPaymentsService } from './ciro-fuel-payments.service';
import { CiroFuelPaymentsProcessor } from './ciro-fuel-payments.processor';
import { CIRO_FUEL_TRANSFER_PROVIDER } from './payment-transfer.provider';
import { MockCardTransferProvider } from './mock-card-transfer.provider';

@Module({
  imports: [
    TransactionsModule,
    WalletsModule,
    BullModule.registerQueue({ name: CIRO_FUEL_PAYMENT_QUEUE }),
    MongooseModule.forFeature([
      {
        name: CiroFuelTransaction.name,
        schema: CiroFuelTransactionSchema,
      },
    ]),
  ],
  controllers: [CiroFuelTransactionsController],
  providers: [
    CiroFuelTransactionsService,
    CiroFuelTransactionsRepository,
    CiroFuelPaymentsService,
    CiroFuelPaymentsProcessor,
    {
      provide: CIRO_FUEL_TRANSFER_PROVIDER,
      useClass: MockCardTransferProvider,
    },
  ],
  exports: [CiroFuelTransactionsService],
})
export class CiroFuelTransactionsModule {}
