import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Car } from '../cars/schemas/car.schema';
import { DriverInvitationsRepository } from './driver-invitations.repository';
import { DriverInvitationStatus } from './enum/driver-invitation-status.enum';
import { DriverInvitation } from './schemas/driver-invitation.schema';

describe('DriverInvitationsRepository', () => {
  let repository: DriverInvitationsRepository;
  let driverInvitationsModel: {
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let carsModel: { findByIdAndUpdate: jest.Mock };

  const id = '507f1f77bcf86cd799439011';
  const invitation = {
    car: new Types.ObjectId('507f1f77bcf86cd799439012'),
    driver: new Types.ObjectId('507f1f77bcf86cd799439013'),
  };

  beforeEach(async () => {
    driverInvitationsModel = {
      findById: jest.fn().mockResolvedValue(invitation),
      findByIdAndUpdate: jest.fn().mockResolvedValue(invitation),
    };
    carsModel = {
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverInvitationsRepository,
        {
          provide: getModelToken(DriverInvitation.name),
          useValue: driverInvitationsModel,
        },
        { provide: getModelToken(Car.name), useValue: carsModel },
      ],
    }).compile();

    repository = module.get<DriverInvitationsRepository>(
      DriverInvitationsRepository,
    );
  });

  it('adds the driver to the car and marks the invitation accepted', async () => {
    await expect(repository.acceptInvitation(id)).resolves.toBeUndefined();

    expect(carsModel.findByIdAndUpdate).toHaveBeenCalledWith(
      invitation.car,
      { $addToSet: { drivers: invitation.driver } },
      { returnDocument: 'after' },
    );
    expect(driverInvitationsModel.findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      { status: DriverInvitationStatus.ACCEPTED },
      { returnDocument: 'after' },
    );
  });

  it('throws when the invitation no longer exists', async () => {
    driverInvitationsModel.findById.mockResolvedValue(null);

    await expect(repository.acceptInvitation(id)).rejects.toThrow(
      new NotFoundException('Driver invitation not found'),
    );
    expect(carsModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('does not mark the invitation accepted when its car is missing', async () => {
    carsModel.findByIdAndUpdate.mockResolvedValue(null);

    await expect(repository.acceptInvitation(id)).rejects.toThrow(
      new NotFoundException('Car not found'),
    );
    expect(driverInvitationsModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
