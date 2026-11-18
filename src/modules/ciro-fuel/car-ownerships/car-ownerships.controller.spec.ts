import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CarOwnershipsController } from './car-ownerships.controller';
import { CarOwnershipsService } from './car-ownerships.service';
import { CreateCarOwnershipDto } from './dto/create-car-ownership.dto';
import { UpdateCarOwnershipDto } from './dto/update-car-ownership.dto';
import { CarOwnership } from './schema/car-ownership.schema';

describe('CarOwnershipsController', () => {
  let controller: CarOwnershipsController;
  let carOwnershipsService: {
    create: jest.Mock;
    findAllByOwnerId: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const ownerId = '507f1f77bcf86cd799439011';
  const ownership: CarOwnership = {
    owner: new Types.ObjectId(ownerId),
    car: new Types.ObjectId('507f191e810c19729de860ea'),
    category: 'personal',
  };
  const createDto: CreateCarOwnershipDto = {
    owner: ownerId,
    car: '507f191e810c19729de860ea',
    category: 'personal',
  };

  beforeEach(async () => {
    carOwnershipsService = {
      create: jest.fn(),
      findAllByOwnerId: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarOwnershipsController],
      providers: [
        { provide: CarOwnershipsService, useValue: carOwnershipsService },
      ],
    }).compile();

    controller = module.get<CarOwnershipsController>(CarOwnershipsController);
  });

  it('creates an ownership', async () => {
    carOwnershipsService.create.mockResolvedValue(ownership);

    await expect(controller.create(createDto)).resolves.toBe(ownership);
    expect(carOwnershipsService.create).toHaveBeenCalledWith(createDto);
  });

  it('lists ownerships by owner', async () => {
    carOwnershipsService.findAllByOwnerId.mockResolvedValue([ownership]);

    await expect(controller.findAllByOwnerId(ownerId)).resolves.toEqual([
      ownership,
    ]);
    expect(carOwnershipsService.findAllByOwnerId).toHaveBeenCalledWith(ownerId);
  });

  it('updates an ownership', async () => {
    const id = 'ownership-id';
    const updateDto: UpdateCarOwnershipDto = { category: 'commercial' };
    carOwnershipsService.update.mockResolvedValue(ownership);

    await expect(controller.update(id, updateDto)).resolves.toBe(ownership);
    expect(carOwnershipsService.update).toHaveBeenCalledWith(id, updateDto);
  });

  it('removes an ownership', async () => {
    const id = 'ownership-id';
    carOwnershipsService.remove.mockResolvedValue(ownership);

    await expect(controller.remove(id)).resolves.toBe(ownership);
    expect(carOwnershipsService.remove).toHaveBeenCalledWith(id);
  });
});
