import { Body, Controller, Get, Put } from '@nestjs/common';
import { FuelPricesService } from './fuel-prices.service';
import { UpdateFuelPricesDto } from './dto/update-fuel-prices.dto';

@Controller('fuel-prices')
export class FuelPricesController {
  constructor(private readonly fuelPricesService: FuelPricesService) {}

  @Get()
  async getFuelPrices() {
    return await this.fuelPricesService.getFuelPrices();
  }

  @Put()
  async updateFuelPrices(@Body() updateData: UpdateFuelPricesDto) {
    return await this.fuelPricesService.updateFuelPrices(updateData);
  }
}
