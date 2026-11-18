import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { CarsService } from '../cars/cars.service';
import { UsersService } from '../../users/users.service';
import { DriverInvitationsRepository } from './driver-invitations.repository';
import { DriverInvitationsService } from './driver-invitations.service';
import { CreateDriverInvitationDto } from './dto/create-driver-invitation.dto';
import { DriverInvitationStatus } from './enum/driver-invitation-status.enum';
import { DriverInvitation } from './schemas/driver-invitation.schema';

describe('DriverInvitationsService', () => {
  let service: DriverInvitationsService;
  let driverInvitationsRepository: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    delete: jest.Mock;
    exists: jest.Mock;
    acceptInvitation: jest.Mock;
    rejectInvitation: jest.Mock;
  };
  let usersService: { exists: jest.Mock };
  let carsService: { exists: jest.Mock };

  const id = '507f1f77bcf86cd799439011';
  const createDto: CreateDriverInvitationDto = {
    owner: id,
    driver: '507f191e810c19729de860ea',
    car: '507f1f77bcf86cd799439012',
  };
  const invitation: DriverInvitation = {
    owner: new Types.ObjectId(createDto.owner),
    driver: new Types.ObjectId(createDto.driver),
    car: new Types.ObjectId(createDto.car),
    status: DriverInvitationStatus.SENT,
  };

  beforeEach(async () => {
    driverInvitationsRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(id) }),
      acceptInvitation: jest.fn(),
      rejectInvitation: jest.fn(),
    };
    usersService = { exists: jest.fn().mockResolvedValue(true) };
    carsService = { exists: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverInvitationsService,
        {
          provide: DriverInvitationsRepository,
          useValue: driverInvitationsRepository,
        },
        { provide: UsersService, useValue: usersService },
        { provide: CarsService, useValue: carsService },
      ],
    }).compile();

    service = module.get<DriverInvitationsService>(DriverInvitationsService);
  });

  describe('create', () => {
    it('creates an invitation when owner, driver, and car exist', async () => {
      driverInvitationsRepository.create.mockResolvedValue(invitation);

      await expect(service.create(createDto)).resolves.toBe(invitation);
      expect(usersService.exists).toHaveBeenNthCalledWith(1, createDto.owner);
      expect(usersService.exists).toHaveBeenNthCalledWith(2, createDto.driver);
      expect(carsService.exists).toHaveBeenCalledWith(createDto.car);
      expect(driverInvitationsRepository.create).toHaveBeenCalledWith(
        createDto,
      );
    });

    it('rejects creation when the owner does not exist', async () => {
      usersService.exists.mockResolvedValueOnce(false);

      await expect(service.create(createDto)).rejects.toThrow(
        new NotFoundException('Owner not found'),
      );
      expect(driverInvitationsRepository.create).not.toHaveBeenCalled();
    });

    it('rejects creation when the driver does not exist', async () => {
      usersService.exists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(service.create(createDto)).rejects.toThrow(
        new NotFoundException('Driver not found'),
      );
      expect(driverInvitationsRepository.create).not.toHaveBeenCalled();
    });

    it('rejects creation when the car does not exist', async () => {
      carsService.exists.mockResolvedValue(false);

      await expect(service.create(createDto)).rejects.toThrow(
        new NotFoundException('Car not found'),
      );
      expect(driverInvitationsRepository.create).not.toHaveBeenCalled();
    });
  });

  it('lists invitations', async () => {
    driverInvitationsRepository.findAll.mockResolvedValue([invitation]);

    await expect(service.findAll()).resolves.toEqual([invitation]);
    expect(driverInvitationsRepository.findAll).toHaveBeenCalled();
  });

  describe('findOne', () => {
    it('returns an invitation when found', async () => {
      driverInvitationsRepository.findById.mockResolvedValue(invitation);

      await expect(service.findOne(id)).resolves.toBe(invitation);
      expect(driverInvitationsRepository.findById).toHaveBeenCalledWith(id);
    });

    it('throws when the invitation does not exist', async () => {
      driverInvitationsRepository.findById.mockResolvedValue(null);

      await expect(service.findOne(id)).rejects.toThrow(
        new NotFoundException('Driver invitation not found'),
      );
    });
  });

  describe('remove', () => {
    it('returns the removed invitation', async () => {
      driverInvitationsRepository.delete.mockResolvedValue(invitation);

      await expect(service.remove(id)).resolves.toBe(invitation);
      expect(driverInvitationsRepository.delete).toHaveBeenCalledWith(id);
    });

    it('throws when the invitation does not exist', async () => {
      driverInvitationsRepository.delete.mockResolvedValue(null);

      await expect(service.remove(id)).rejects.toThrow(
        new NotFoundException('Driver invitation not found'),
      );
    });
  });

  describe('acceptInvitation', () => {
    it('accepts an existing invitation', async () => {
      await expect(service.acceptInvitation(id)).resolves.toBeUndefined();
      expect(driverInvitationsRepository.exists).toHaveBeenCalledWith(id);
      expect(driverInvitationsRepository.acceptInvitation).toHaveBeenCalledWith(
        id,
      );
    });

    it('throws when the invitation does not exist', async () => {
      driverInvitationsRepository.exists.mockResolvedValue(null);

      await expect(service.acceptInvitation(id)).rejects.toThrow(
        new NotFoundException('Driver invitation not found'),
      );
      expect(
        driverInvitationsRepository.acceptInvitation,
      ).not.toHaveBeenCalled();
    });
  });

  describe('rejectInvitation', () => {
    it('rejects an existing invitation', async () => {
      await expect(service.rejectInvitation(id)).resolves.toBeUndefined();
      expect(driverInvitationsRepository.exists).toHaveBeenCalledWith(id);
      expect(driverInvitationsRepository.rejectInvitation).toHaveBeenCalledWith(
        id,
      );
    });

    it('throws when the invitation does not exist', async () => {
      driverInvitationsRepository.exists.mockResolvedValue(null);

      await expect(service.rejectInvitation(id)).rejects.toThrow(
        new NotFoundException('Driver invitation not found'),
      );
      expect(
        driverInvitationsRepository.rejectInvitation,
      ).not.toHaveBeenCalled();
    });
  });
});
