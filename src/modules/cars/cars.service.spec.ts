import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { CarsRepository } from './cars.repository';
import { CarsService } from './cars.service';
import { AdminUpdateCarDto } from './dto/admin-update-car.dto';
import { CreateCarDto } from './dto/create-car.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { VehicleCategory } from './enum/vehicle-category.enum';
import { Car } from './schemas/car.schema';
import { FuelTypes } from '../fuel-prices/enum/fuel-types-enum';

describe('CarsService', () => {
  let service: CarsService;
  let carsRepository: {
    create: jest.Mock;
    findAllByOwnerId: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    adminUpdate: jest.Mock;
  };
  let usersService: { exists: jest.Mock };

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
    carsRepository = {
      create: jest.fn(),
      findAllByOwnerId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      adminUpdate: jest.fn(),
    };
    usersService = { exists: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarsService,
        { provide: CarsRepository, useValue: carsRepository },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<CarsService>(CarsService);
  });

  describe('create', () => {
    it('creates a car when its owner exists', async () => {
      usersService.exists.mockResolvedValue(true);
      carsRepository.create.mockResolvedValue(car);

      await expect(service.create(createCarDto)).resolves.toBe(car);
      expect(usersService.exists).toHaveBeenCalledWith(ownerId);
      expect(carsRepository.create).toHaveBeenCalledWith(createCarDto);
    });

    it('rejects creation when its owner does not exist', async () => {
      usersService.exists.mockResolvedValue(false);

      await expect(service.create(createCarDto)).rejects.toThrow(
        new NotFoundException('Owner not found'),
      );
      expect(carsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllByOwnerId', () => {
    it('returns the owner cars when the owner exists', async () => {
      usersService.exists.mockResolvedValue(true);
      carsRepository.findAllByOwnerId.mockResolvedValue([car]);

      await expect(service.findAllByOwnerId(ownerId)).resolves.toEqual([car]);
      expect(usersService.exists).toHaveBeenCalledWith(ownerId);
      expect(carsRepository.findAllByOwnerId).toHaveBeenCalledWith(ownerId);
    });

    it('rejects when the owner does not exist', async () => {
      usersService.exists.mockResolvedValue(false);

      await expect(service.findAllByOwnerId(ownerId)).rejects.toThrow(
        new NotFoundException('Owner not found'),
      );
      expect(carsRepository.findAllByOwnerId).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the car when found', async () => {
      carsRepository.findById.mockResolvedValue(car);

      await expect(service.findById('car-id')).resolves.toBe(car);
      expect(carsRepository.findById).toHaveBeenCalledWith('car-id');
    });

    it('rejects when the car is missing', async () => {
      carsRepository.findById.mockResolvedValue(null);

      await expect(service.findById('car-id')).rejects.toThrow(
        new NotFoundException('Car not found'),
      );
    });
  });

  describe('update', () => {
    const id = 'car-id';
    const updateCarDto: UpdateCarDto = { model: 'Corolla' };

    it('returns the updated car', async () => {
      carsRepository.update.mockResolvedValue(car);

      await expect(service.update(id, updateCarDto)).resolves.toBe(car);
      expect(carsRepository.update).toHaveBeenCalledWith(id, updateCarDto);
    });

    it('rejects when the car is missing', async () => {
      carsRepository.update.mockResolvedValue(null);

      await expect(service.update(id, updateCarDto)).rejects.toThrow(
        new NotFoundException('Car not found'),
      );
    });
  });

  describe('remove', () => {
    const id = 'car-id';

    it('returns the removed car', async () => {
      carsRepository.remove.mockResolvedValue(car);

      await expect(service.remove(id)).resolves.toBe(car);
      expect(carsRepository.remove).toHaveBeenCalledWith(id);
    });

    it('rejects when the car is missing', async () => {
      carsRepository.remove.mockResolvedValue(null);

      await expect(service.remove(id)).rejects.toThrow(
        new NotFoundException('Car not found'),
      );
    });
  });

  describe('adminUpdate', () => {
    const id = 'car-id';
    const adminUpdateCarDto: AdminUpdateCarDto = { isGpsEnabled: true };

    it('returns the updated car', async () => {
      carsRepository.adminUpdate.mockResolvedValue(car);

      await expect(service.adminUpdate(id, adminUpdateCarDto)).resolves.toBe(
        car,
      );
      expect(carsRepository.adminUpdate).toHaveBeenCalledWith(
        id,
        adminUpdateCarDto,
      );
    });

    it('rejects when the car is missing', async () => {
      carsRepository.adminUpdate.mockResolvedValue(null);

      await expect(service.adminUpdate(id, adminUpdateCarDto)).rejects.toThrow(
        new NotFoundException('Car not found'),
      );
    });
  });
});
