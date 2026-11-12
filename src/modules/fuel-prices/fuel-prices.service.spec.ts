import { Test, TestingModule } from '@nestjs/testing';
import { FuelPricesService } from './fuel-prices.service';
import { FuelPricesRepository } from './fuel-prices.repository';
import { UpdateFuelPricesDto } from './dto/update-fuel-prices.dto';
import { FuelPrices } from './schemas/fuel-prices.schmea';

describe('FuelPricesService', () => {
  let service: FuelPricesService;
  let fuelPricesRepository: {
    getFuelPrices: jest.Mock;
    updateFuelPrices: jest.Mock;
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
      getFuelPrices: jest.fn(),
      updateFuelPrices: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FuelPricesService,
        { provide: FuelPricesRepository, useValue: fuelPricesRepository },
      ],
    }).compile();

    service = module.get<FuelPricesService>(FuelPricesService);
  });

  describe('getFuelPrices', () => {
    it('returns the fuel prices from the repository', async () => {
      fuelPricesRepository.getFuelPrices.mockResolvedValue(fuelPrices);

      await expect(service.getFuelPrices()).resolves.toBe(fuelPrices);
      expect(fuelPricesRepository.getFuelPrices).toHaveBeenCalledTimes(1);
    });

    it('throws when fuel prices do not exist', async () => {
      fuelPricesRepository.getFuelPrices.mockResolvedValue(null);

      await expect(service.getFuelPrices()).rejects.toThrow(
        'Fuel prices not found',
      );
    });
  });

  describe('updateFuelPrices', () => {
    it('forwards the update data and returns the repository result', async () => {
      fuelPricesRepository.updateFuelPrices.mockResolvedValue(fuelPrices);

      await expect(service.updateFuelPrices(updateData)).resolves.toBe(
        fuelPrices,
      );
      expect(fuelPricesRepository.updateFuelPrices).toHaveBeenCalledWith(
        updateData,
      );
    });
  });
});
