import { Test, TestingModule } from '@nestjs/testing';
import { FuelPricesService } from './fuel-prices.service';
import { FuelPricesRepository } from './fuel-prices.repository';
import { UpdateFuelPricesDto } from './dto/update-fuel-prices.dto';
import { FuelPrices } from './schemas/fuel-prices.schmea';

describe('FuelPricesService', () => {
  let service: FuelPricesService;
  let fuelPricesRepository: {
    getCurrent: jest.Mock;
    update: jest.Mock;
  };

  const fuelPrices: FuelPrices = {
    _id: 'fuel_prices',
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
    fuelPricesRepository = {
      getCurrent: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FuelPricesService,
        { provide: FuelPricesRepository, useValue: fuelPricesRepository },
      ],
    }).compile();

    service = module.get<FuelPricesService>(FuelPricesService);
  });

  describe('getCurrent', () => {
    it('returns the fuel prices from the repository', async () => {
      fuelPricesRepository.getCurrent.mockResolvedValue(fuelPrices);

      await expect(service.getCurrent()).resolves.toBe(fuelPrices);
      expect(fuelPricesRepository.getCurrent).toHaveBeenCalledTimes(1);
    });

    it('throws when fuel prices do not exist', async () => {
      fuelPricesRepository.getCurrent.mockResolvedValue(null);

      await expect(service.getCurrent()).rejects.toThrow(
        'Fuel prices not found',
      );
    });
  });

  describe('update', () => {
    it('forwards the update data and returns the repository result', async () => {
      fuelPricesRepository.update.mockResolvedValue(fuelPrices);

      await expect(service.update(updateData)).resolves.toBe(fuelPrices);
      expect(fuelPricesRepository.update).toHaveBeenCalledWith(updateData);
    });
  });
});
