import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentVerificationService } from './payment-verification.service';
import { PaymentVerificationController } from './payment-verification.controller';
import {
  PaymentVerification,
  PaymentVerificationSchema,
} from './schemas/payment-verification.schema';
import { PaymentVerificationRepository } from './payment-verification.repository';
import { PaymentVerificationStageGuard } from './guards/payment-verification-stage.guard';
import { CarsModule } from '../cars/cars.module';
import { FuelPricesModule } from '../fuel-prices/fuel-prices.module';
import { StationsModule } from '../stations/stations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentVerification.name, schema: PaymentVerificationSchema },
    ]),
    CarsModule,
    StationsModule,
    FuelPricesModule,
  ],
  controllers: [PaymentVerificationController],
  providers: [
    PaymentVerificationService,
    PaymentVerificationRepository,
    PaymentVerificationStageGuard,
  ],
})
export class PaymentVerificationModule {}
