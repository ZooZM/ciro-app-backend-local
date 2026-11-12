import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  FUEL_PRICES_ID,
  FuelPrices,
  FuelPricesDocument,
} from './schemas/fuel-prices.schmea';
import { Model } from 'mongoose';
import { UpdateFuelPricesDto } from './dto/update-fuel-prices.dto';

@Injectable()
export class FuelPricesRepository implements OnModuleInit {
  constructor(
    @InjectModel(FuelPrices.name)
    private readonly fuelPricesModel: Model<FuelPricesDocument>,
  ) {}

  async getFuelPrices(): Promise<FuelPricesDocument | null> {
    return this.fuelPricesModel.findById(FUEL_PRICES_ID).lean().exec();
  }

  async updateFuelPrices(
    updateData: UpdateFuelPricesDto,
  ): Promise<FuelPricesDocument | null> {
    return this.fuelPricesModel
      .findByIdAndUpdate(
        FUEL_PRICES_ID,
        { $set: updateData },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();
  }

  async onModuleInit() {
    await this.fuelPricesModel.updateOne(
      { _id: FUEL_PRICES_ID },
      {
        $setOnInsert: {
          gasoline_91: 0,
          gasoline_95: 0,
          gasoline_98: 0,
          diesel: 0,
          kerosene: 0,
        },
      },
      { upsert: true },
    );
  }
}
