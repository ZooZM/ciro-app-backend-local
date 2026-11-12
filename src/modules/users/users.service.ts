import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { User, UserDocument } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(createData: Partial<User>): Promise<UserDocument> {
    try {
      const existingUser = await this.usersRepository.findByPhoneNumber(
        createData.phoneNumber as string,
      );
      if (existingUser) {
        throw new ConflictException(
          'User with this phone number already exists',
        );
      }

      let hashedPassword;
      if (createData.password) {
        hashedPassword = await bcrypt.hash(createData.password, 10);
      }

      const newUser = await this.usersRepository.create({
        ...createData,
        ...(hashedPassword && { password: hashedPassword }),
      });

      return newUser;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Error creating user');
    }
  }

  async findByPhoneNumber(phoneNumber: string): Promise<UserDocument | null> {
    return this.usersRepository.findByPhoneNumber(phoneNumber);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.usersRepository.findOne({ email } as any);
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.usersRepository.findById(id);
  }

  async exists(id: string): Promise<boolean> {
    return !!(await this.usersRepository.exists(id));
  }

  async updateRefreshToken(
    id: string,
    refreshToken: string | null,
  ): Promise<void> {
    await this.usersRepository.updateOne({ _id: id } as any, { refreshToken });
  }

  /** Returns the server-assigned `locationUpdatedAt` (FR-003b, single clock — R11). */
  async updateLocation(
    userId: string,
    lng: number,
    lat: number,
  ): Promise<Date> {
    const locationUpdatedAt = new Date();
    await this.usersRepository.updateOne({ _id: userId } as any, {
      $set: {
        location: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        locationUpdatedAt,
        isSharingLocation: true,
      },
    });
    return locationUpdatedAt;
  }

  /** Stopping sharing keeps the last known `location` (for history/debugging)
   * but excludes the user from Following-tab queries until they share again. */
  async setSharingLocation(userId: string, enabled: boolean): Promise<void> {
    await this.usersRepository.updateOne({ _id: userId } as any, {
      isSharingLocation: enabled,
    });
  }

  async getNearbyUsers(
    userId: string,
    lng: number,
    lat: number,
    maxDistanceKm: number,
    allowedUserIds: string[],
  ) {
    return this.usersRepository.getNearbyUsers(
      userId,
      lng,
      lat,
      maxDistanceKm,
      allowedUserIds,
    );
  }

  async setGhostMode(userId: string, enabled: boolean): Promise<void> {
    await this.usersRepository.updateOne({ _id: userId } as any, {
      isGhostMode: enabled,
    });
  }

  async isGhostMode(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findById(userId);
    return user?.isGhostMode === true;
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const user = await this.usersRepository.findById(userId);
    return (user?.blockedUsers ?? []).map((id) => id.toString());
  }

  async findManyByIds(ids: string[]) {
    return this.usersRepository.findManyByIds(ids);
  }

  /**
   * Given a list of phone numbers from the device contact list,
   * returns only those that are registered users in the app, and persists
   * the submitted list as the caller's `syncedContacts` (FR-005) so mutual
   * contacts can be evaluated for the Status feature.
   * Only safe public fields are returned (no password, no tokens).
   */
  async syncContacts(userId: string, phoneNumbers: string[]) {
    await this.usersRepository.updateOne({ _id: userId } as any, {
      $set: { syncedContacts: phoneNumbers },
    });
    return this.usersRepository.findByPhoneNumbers(phoneNumbers);
  }

  async findMutualContactIds(userId: string) {
    return this.usersRepository.findMutualContactIds(userId);
  }

  async updateOnlineStatus(userId: string, isOnline: boolean): Promise<void> {
    await this.usersRepository.updateOne({ _id: userId } as any, { isOnline });
    const user = await this.usersRepository.findById(userId);
    console.log(`User ${userId} is ${user?.isOnline}`);
  }
}
