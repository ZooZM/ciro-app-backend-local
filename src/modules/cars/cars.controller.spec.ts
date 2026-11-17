jest.mock('@nestjs/mapped-types', () => ({
  PartialType: (Base: new () => object) => class extends Base {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { AdminUpdateCarDto } from './dto/admin-update-car.dto';
import { VehicleCategory } from './enum/vehicle-category.enum';
import { Car } from './schemas/car.schema';
import { FuelTypes } from '../fuel-prices/enum/fuel-types-enum';

describe('CarsController', () => {
  let controller: CarsController;
  let carsService: {
    create: jest.Mock;
    findAllByOwnerId: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    adminUpdate: jest.Mock;
  };

  const ownerId = '507f1f77bcf86cd799439011';
  const car: Car = {
    model: 'Camry',
    brand: 'Toyota',
    licensePlate: 'ABC1234',
    vehicleCategory: VehicleCategory.SEDAN,
    fuelType: FuelTypes.GASOLINE_91,
    image: 'https://example.com/car.jpg',
    isActive: true,
    owner: new Types.ObjectId(ownerId),
    isGpsEnabled: false,
    tankCapacity: 60,
  };
  const createCarDto: CreateCarDto = {
    model: car.model,
    brand: car.brand,
    licensePlate: car.licensePlate,
    vehicleCategory: car.vehicleCategory,
    fuelType: car.fuelType,
    image: car.image,
    isActive: true,
    owner: ownerId,
    tankCapacity: car.tankCapacity,
  };

  beforeEach(async () => {
    carsService = {
      create: jest.fn(),
      findAllByOwnerId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      adminUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarsController],
      providers: [{ provide: CarsService, useValue: carsService }],
    }).compile();

    controller = module.get<CarsController>(CarsController);
  });

  it('creates a car', async () => {
    carsService.create.mockResolvedValue(car);

    await expect(controller.create(createCarDto)).resolves.toBe(car);
    expect(carsService.create).toHaveBeenCalledWith(createCarDto);
  });

  it('lists cars by owner', async () => {
    carsService.findAllByOwnerId.mockResolvedValue([car]);

    await expect(controller.findAllByOwnerId(ownerId)).resolves.toEqual([car]);
    expect(carsService.findAllByOwnerId).toHaveBeenCalledWith(ownerId);
  });

  it('gets a car by id', async () => {
    const id = 'car-id';
    carsService.findById.mockResolvedValue(car);

    await expect(controller.findById(id)).resolves.toBe(car);
    expect(carsService.findById).toHaveBeenCalledWith(id);
  });

  it('updates a car', async () => {
    const id = 'car-id';
    const updateCarDto: UpdateCarDto = { model: 'Corolla' };
    carsService.update.mockResolvedValue(car);

    await expect(controller.update(id, updateCarDto)).resolves.toBe(car);
    expect(carsService.update).toHaveBeenCalledWith(id, updateCarDto);
  });

  it('removes a car', async () => {
    const id = 'car-id';
    carsService.remove.mockResolvedValue(car);

    await expect(controller.remove(id)).resolves.toBe(car);
    expect(carsService.remove).toHaveBeenCalledWith(id);
  });

  it('admin-updates a car', async () => {
    const id = 'car-id';
    const adminUpdateCarDto: AdminUpdateCarDto = { isGpsEnabled: true };
    carsService.adminUpdate.mockResolvedValue(car);

    await expect(controller.adminUpdate(id, adminUpdateCarDto)).resolves.toBe(
      car,
    );
    expect(carsService.adminUpdate).toHaveBeenCalledWith(id, adminUpdateCarDto);
  });
});
