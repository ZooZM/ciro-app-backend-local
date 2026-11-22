import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentVerificationsService } from './payment-verifications.service';
import { paymentVerificationsController } from './payment-verifications.controller';
import {
  PaymentVerification,
  PaymentVerificationSchema,
} from './schemas/payment-verification.schema';
import { PaymentVerificationsRepository } from './payment-verifications.repository';
import { PaymentVerificationStageGuard } from './guards/payment-verification-stage.guard';
import { CarsModule } from '../cars/cars.module';
import { FuelPricesModule } from '../fuel-prices/fuel-prices.module';
import { StationsModule } from '../stations/stations.module';
import { CiroFuelTransactionsModule } from '../ciro-fuel-transactions/ciro-fuel-transactions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentVerification.name, schema: PaymentVerificationSchema },
    ]),
    CarsModule,
    StationsModule,
    FuelPricesModule,
    CiroFuelTransactionsModule,
  ],
  controllers: [paymentVerificationsController],
  providers: [
    PaymentVerificationsService,
    PaymentVerificationsRepository,
    PaymentVerificationStageGuard,
  ],
})
export class PaymentVerificationsModule {}
