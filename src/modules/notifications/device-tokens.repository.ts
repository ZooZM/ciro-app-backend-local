import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DevicePlatform,
  DeviceToken,
  DeviceTokenDocument,
  PushLocale,
} from './device-token.schema';

@Injectable()
export class DeviceTokensRepository {
  constructor(
    @InjectModel(DeviceToken.name)
    private readonly model: Model<DeviceTokenDocument>,
  ) {}

  async upsertToken(
    userId: string,
    token: string,
    platform: DevicePlatform,
    locale: PushLocale = 'ar',
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId), token },
        {
          $set: {
            platform,
            locale,
            userId: new Types.ObjectId(userId),
            token,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async getTokens(userId: string): Promise<DeviceTokenDocument[]> {
    return this.model.find({ userId: new Types.ObjectId(userId) }).exec();
  }

  async deleteAllTokensForUser(userId: string): Promise<void> {
    await this.model.deleteMany({ userId: new Types.ObjectId(userId) }).exec();
  }

  /** 026 (R8): revoking a watch session removes that user's `apns-watch` tokens. */
  async deleteByUserAndPlatform(
    userId: string,
    platform: DevicePlatform,
  ): Promise<void> {
    await this.model
      .deleteMany({ userId: new Types.ObjectId(userId), platform })
      .exec();
  }

  /** APNs answered 410 / BadDeviceToken. */
  async deleteToken(token: string): Promise<void> {
    await this.model.deleteMany({ token }).exec();
  }
}
