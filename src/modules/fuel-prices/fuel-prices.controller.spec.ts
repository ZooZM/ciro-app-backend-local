import { Test, TestingModule } from '@nestjs/testing';
import { FuelPricesController } from './fuel-prices.controller';
import { FuelPricesService } from './fuel-prices.service';
import { UpdateFuelPricesDto } from './dto/update-fuel-prices.dto';

describe('FuelPricesController', () => {
  let controller: FuelPricesController;
  let fuelPricesService: {
    getCurrent: jest.Mock;
    update: jest.Mock;
  };

  const fuelPrices = {
    gasoline_91: 1.1,
    gasoline_95: 1.2,
    gasoline_98: 1.3,
    diesel: 1.4,
    kerosene: 1.5,
  };

  const updateData: UpdateFuelPricesDto = {
    gasoline_91: 2.1,
    gasoline_95: 2.2,
    gasoline_98: 2.3,
    diesel: 2.4,
    kerosene: 2.5,
  };

  beforeEach(async () => {
    fuelPricesService = {
      getCurrent: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FuelPricesController],
      providers: [{ provide: FuelPricesService, useValue: fuelPricesService }],
    }).compile();

    controller = module.get<FuelPricesController>(FuelPricesController);
  });

  describe('getFuelPrices', () => {
    it('returns fuel prices from the service', async () => {
      fuelPricesService.getCurrent.mockResolvedValue(fuelPrices);

      await expect(controller.getFuelPrices()).resolves.toBe(fuelPrices);
      expect(fuelPricesService.getCurrent).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateFuelPrices', () => {
    it('forwards update data and returns the service result', async () => {
      fuelPricesService.update.mockResolvedValue(fuelPrices);

      await expect(controller.updateFuelPrices(updateData)).resolves.toBe(
        fuelPrices,
      );
      expect(fuelPricesService.update).toHaveBeenCalledWith(updateData);
    });
  });
});
