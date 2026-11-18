import { Module } from '@nestjs/common';
import { FuelPricesService } from './fuel-prices.service';
import { FuelPricesController } from './fuel-prices.controller';
import { FuelPrices, FuelPricesSchema } from './schemas/fuel-prices.schmea';
import { MongooseModule } from '@nestjs/mongoose';
import { FuelPricesRepository } from './fuel-prices.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FuelPrices.name, schema: FuelPricesSchema },
    ]),
  ],
  controllers: [FuelPricesController],
  providers: [FuelPricesService, FuelPricesRepository],
  exports: [FuelPricesService],
})
export class FuelPricesModule {}
