import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CiroFuelTransactionsService } from './ciro-fuel-transactions.service';
import { CiroFuelTransactionsController } from './ciro-fuel-transactions.controller';
import {
  CiroFuelTransaction,
  CiroFuelTransactionSchema,
} from './schemas/ciro-fuel-transaction.schema';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CiroFuelTransaction.name,
        schema: CiroFuelTransactionSchema,
      },
    ]),
  ],
  controllers: [CiroFuelTransactionsController],
  providers: [CiroFuelTransactionsService, CiroFuelTransactionsRepository],
})
export class CiroFuelTransactionsModule {}
