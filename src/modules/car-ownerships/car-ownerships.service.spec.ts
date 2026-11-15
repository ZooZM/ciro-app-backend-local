import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { CarOwnershipsRepository } from './car-ownerships.repository';
import { CarOwnershipsService } from './car-ownerships.service';
import { CreateCarOwnershipDto } from './dto/create-car-ownership.dto';
import { UpdateCarOwnershipDto } from './dto/update-car-ownership.dto';
import { CarOwnership } from './schema/car-ownership.schema';

describe('CarOwnershipsService', () => {
  let service: CarOwnershipsService;
  let carOwnershipsRepository: {
    create: jest.Mock;
    findAllByOwnerId: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let usersService: { exists: jest.Mock };

  const ownerId = '507f1f77bcf86cd799439011';
  const createDto: CreateCarOwnershipDto = {
    owner: ownerId,
    car: '507f191e810c19729de860ea',
    category: 'personal',
  };
  const ownership: CarOwnership = {
    owner: new Types.ObjectId(ownerId),
    car: new Types.ObjectId(createDto.car),
    category: createDto.category,
  };

  beforeEach(async () => {
    carOwnershipsRepository = {
      create: jest.fn(),
      findAllByOwnerId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    usersService = { exists: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarOwnershipsService,
        {
          provide: CarOwnershipsRepository,
          useValue: carOwnershipsRepository,
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<CarOwnershipsService>(CarOwnershipsService);
  });

  describe('create', () => {
    it('creates an ownership when its owner exists', async () => {
      usersService.exists.mockResolvedValue(true);
      carOwnershipsRepository.create.mockResolvedValue(ownership);

      await expect(service.create(createDto)).resolves.toBe(ownership);
      expect(usersService.exists).toHaveBeenCalledWith(ownerId);
      expect(carOwnershipsRepository.create).toHaveBeenCalledWith(createDto);
    });

    it('rejects creation when its owner does not exist', async () => {
      usersService.exists.mockResolvedValue(false);

      await expect(service.create(createDto)).rejects.toThrow(
        new NotFoundException('Owner not found'),
      );
      expect(carOwnershipsRepository.create).not.toHaveBeenCalled();
    });
  });

  it('lists ownerships by owner id', async () => {
    carOwnershipsRepository.findAllByOwnerId.mockResolvedValue([ownership]);

    await expect(service.findAllByOwnerId(ownerId)).resolves.toEqual([
      ownership,
    ]);
    expect(carOwnershipsRepository.findAllByOwnerId).toHaveBeenCalledWith(
      ownerId,
    );
  });

  describe('update', () => {
    const id = 'ownership-id';
    const updateDto: UpdateCarOwnershipDto = { category: 'commercial' };

    it('returns the updated ownership', async () => {
      carOwnershipsRepository.update.mockResolvedValue(ownership);

      await expect(service.update(id, updateDto)).resolves.toBe(ownership);
      expect(carOwnershipsRepository.update).toHaveBeenCalledWith(id, updateDto);
    });

    it('rejects when the ownership does not exist', async () => {
      carOwnershipsRepository.update.mockResolvedValue(null);

      await expect(service.update(id, updateDto)).rejects.toThrow(
        new NotFoundException('Ownership not found'),
      );
    });
  });

  it('removes an ownership', async () => {
    carOwnershipsRepository.delete.mockResolvedValue(ownership);

    await expect(service.remove('ownership-id')).resolves.toBe(ownership);
    expect(carOwnershipsRepository.delete).toHaveBeenCalledWith('ownership-id');
  });
});
