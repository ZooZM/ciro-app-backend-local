import { Injectable } from '@nestjs/common';
import { FuelPricesRepository } from './fuel-prices.repository';
import { FuelPrices } from './schemas/fuel-prices.schmea';
import { UpdateFuelPricesDto } from './dto/update-fuel-prices.dto';

@Injectable()
export class FuelPricesService {
  constructor(private readonly fuelPricesRepository: FuelPricesRepository) {}

  async getFuelPrices(): Promise<FuelPrices> {
    const fuelPrices = await this.fuelPricesRepository.getFuelPrices();
    if (!fuelPrices) {
      throw new Error('Fuel prices not found');
    }
    return fuelPrices;
  }

  async updateFuelPrices(
    updateData: UpdateFuelPricesDto,
  ): Promise<FuelPrices | null> {
    return this.fuelPricesRepository.updateFuelPrices(updateData);
  }
}
