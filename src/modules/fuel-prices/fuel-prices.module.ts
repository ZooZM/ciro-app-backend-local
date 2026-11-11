import { Module } from '@nestjs/common';
import { FuelPricesService } from './fuel-prices.service';
import { FuelPricesController } from './fuel-prices.controller';
import { FuelPrices, FuelPricesSchema } from './schemas/fuel-prices.schmea';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FuelPrices.name, schema: FuelPricesSchema },
    ]),
  ],
  controllers: [FuelPricesController],
  providers: [FuelPricesService],
})
export class FuelPricesModule {}
