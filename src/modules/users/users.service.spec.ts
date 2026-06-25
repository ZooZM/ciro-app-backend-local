import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<Partial<UsersRepository>>;

  beforeEach(async () => {
    usersRepository = {
      updateOne: jest.fn(),
      findByPhoneNumbers: jest.fn(),
      findMutualContactIds: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn(),
      getNearbyUsers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: usersRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('syncContacts', () => {
    it('persists the synced phone numbers and returns the matching registered users', async () => {
      const userId = new Types.ObjectId().toString();
      const phoneNumbers = ['+1111111111', '+2222222222'];
      const matched = [
        {
          _id: new Types.ObjectId(),
          phoneNumber: '+1111111111',
          name: 'Alice',
        },
      ];
      (usersRepository.findByPhoneNumbers as jest.Mock).mockResolvedValue(
        matched,
      );

      const result = await service.syncContacts(userId, phoneNumbers);

      expect(usersRepository.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        { $set: { syncedContacts: phoneNumbers } },
      );
      expect(usersRepository.findByPhoneNumbers).toHaveBeenCalledWith(
        phoneNumbers,
      );
      expect(result).toBe(matched);
    });
  });

  describe('findMutualContactIds', () => {
    it('delegates to the repository', async () => {
      const userId = new Types.ObjectId().toString();
      const mutualIds = [new Types.ObjectId(), new Types.ObjectId()];
      (usersRepository.findMutualContactIds as jest.Mock).mockResolvedValue(
        mutualIds,
      );

      const result = await service.findMutualContactIds(userId);

      expect(usersRepository.findMutualContactIds).toHaveBeenCalledWith(userId);
      expect(result).toBe(mutualIds);
    });
  });

  describe('updateLocation (018-snap-map-realtime, FR-003b)', () => {
    it('persists coordinates with a server-assigned locationUpdatedAt and returns it', async () => {
      const userId = new Types.ObjectId().toString();

      const result = await service.updateLocation(userId, 31.2, 30.05);

      expect(usersRepository.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        {
          $set: {
            location: { type: 'Point', coordinates: [31.2, 30.05] },
            locationUpdatedAt: result,
            isSharingLocation: true,
          },
        },
      );
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('Ghost Mode (FR-011/013)', () => {
    it('setGhostMode persists the flag', async () => {
      const userId = new Types.ObjectId().toString();
      await service.setGhostMode(userId, true);
      expect(usersRepository.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        { isGhostMode: true },
      );
    });

    it('isGhostMode reads the persisted flag', async () => {
      const userId = new Types.ObjectId().toString();
      (usersRepository.findById as jest.Mock).mockResolvedValue({
        isGhostMode: true,
      });
      await expect(service.isGhostMode(userId)).resolves.toBe(true);
    });

    it('isGhostMode defaults to false when unset', async () => {
      const userId = new Types.ObjectId().toString();
      (usersRepository.findById as jest.Mock).mockResolvedValue({});
      await expect(service.isGhostMode(userId)).resolves.toBe(false);
    });
  });

  describe('getNearbyUsers (SC-001/006) — authorization scoping passthrough', () => {
    it('forwards the allowed-ids set to the repository unchanged', async () => {
      const userId = new Types.ObjectId().toString();
      await service.getNearbyUsers(userId, 31.2, 30.05, 10, ['a', 'b']);
      expect(usersRepository.getNearbyUsers).toHaveBeenCalledWith(
        userId,
        31.2,
        30.05,
        10,
        ['a', 'b'],
      );
    });
  });
});
