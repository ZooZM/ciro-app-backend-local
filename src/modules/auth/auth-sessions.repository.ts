import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AuthSession,
  AuthSessionDocument,
  SessionRevokedReason,
} from './schemas/auth-session.schema';

@Injectable()
export class AuthSessionsRepository {
  constructor(
    @InjectModel(AuthSession.name)
    private readonly model: Model<AuthSessionDocument>,
  ) {}

  create(
    userId: string,
    refreshTokenHash: string,
    id?: Types.ObjectId,
  ): Promise<AuthSessionDocument> {
    return this.model.create({
      ...(id ? { _id: id } : {}),
      userId: new Types.ObjectId(userId),
      deviceType: 'watch',
      refreshTokenHash,
      status: 'active',
    });
  }

  findById(id: string): Promise<AuthSessionDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findById(id).exec();
  }

  findActiveByUser(userId: string): Promise<AuthSessionDocument | null> {
    return this.model
      .findOne({
        userId: new Types.ObjectId(userId),
        deviceType: 'watch',
        status: 'active',
      })
      .exec();
  }

  /** Rotates the hash only if it is still the one presented (a concurrent refresh loses). */
  rotate(
    id: Types.ObjectId,
    expectedHash: string,
    newHash: string,
  ): Promise<AuthSessionDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: 'active', refreshTokenHash: expectedHash },
        { $set: { refreshTokenHash: newHash, lastRefreshedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /** Revokes the user's active watch session; returns whether one existed. */
  async revokeActiveForUser(
    userId: string,
    reason: SessionRevokedReason,
  ): Promise<boolean> {
    const res = await this.model
      .updateMany(
        {
          userId: new Types.ObjectId(userId),
          deviceType: 'watch',
          status: 'active',
        },
        {
          $set: {
            status: 'revoked',
            revokedReason: reason,
            revokedAt: new Date(),
          },
        },
      )
      .exec();
    return res.modifiedCount > 0;
  }

  async isActive(id: string): Promise<boolean> {
    const doc = await this.findById(id);
    return doc?.status === 'active';
  }
}
