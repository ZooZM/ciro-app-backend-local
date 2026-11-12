import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../common/repositories/base.repository';
import {
  User,
  UserDocument,
  SubscriptionTier,
  SubscriptionStatus,
} from './schemas/user.schema';
import {
  Status,
  StatusDocument,
  StatusPrivacy,
} from '../status/schemas/status.schema';

@Injectable()
export class UsersRepository extends BaseRepository<UserDocument> {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Status.name)
    private readonly statusModel: Model<StatusDocument>,
  ) {
    super(userModel);
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByPhoneNumber(phoneNumber: string): Promise<UserDocument | null> {
    return this.findOne({ phoneNumber });
  }

  /**
   * Find all registered users whose phoneNumber is in the provided array.
   * SECURITY: Only safe public fields are projected — password, refreshToken,
   * email, fcmToken, and subscription details are never returned.
   */
  async findByPhoneNumbers(
    phoneNumbers: string[],
  ): Promise<Partial<UserDocument>[]> {
    return this.userModel
      .find({ phoneNumber: { $in: phoneNumbers } })
      .select('_id name phoneNumber avatarUrl isOnline updatedAt')
      .lean()
      .exec();
  }

  async exists(id: string): Promise<{ _id: Types.ObjectId } | null> {
    return this.userModel.exists({ _id: id });
  }

  /** Lean read of the listener's authoritative translation balance, in seconds (FR-021). */
  async getTranslationBalanceSeconds(userId: string): Promise<number> {
    const user = await this.userModel
      .findById(userId)
      .select('subscription.translationSecondsBalance')
      .lean()
      .exec();
    return user?.subscription?.translationSecondsBalance ?? 0;
  }

  /** Lean read of the subscription fields backing `GET /translation/balance` (contracts/rest-endpoints.md). */
  async getTranslationSubscriptionInfo(userId: string): Promise<{
    translationSecondsBalance: number;
    tier: string;
    status: string;
  }> {
    const user = await this.userModel
      .findById(userId)
      .select(
        'subscription.translationSecondsBalance subscription.tier subscription.status',
      )
      .lean()
      .exec();
    return {
      translationSecondsBalance:
        user?.subscription?.translationSecondsBalance ?? 0,
      tier: user?.subscription?.tier ?? SubscriptionTier.FREE,
      status: user?.subscription?.status ?? SubscriptionStatus.ACTIVE,
    };
  }

  /**
   * Atomically decrements `subscription.translationSecondsBalance` by `seconds`,
   * clamped at 0 (FR-026). Uses `$inc` with a `>= seconds` guard so the decrement
   * never goes negative even under concurrent flushes (edge case: balance check race);
   * if the balance is insufficient for the full amount, it is clamped to exactly 0.
   */
  async decrementTranslationBalance(
    userId: string,
    seconds: number,
  ): Promise<number> {
    if (seconds <= 0) {
      return this.getTranslationBalanceSeconds(userId);
    }

    const decremented = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          'subscription.translationSecondsBalance': { $gte: seconds },
        },
        { $inc: { 'subscription.translationSecondsBalance': -seconds } },
        { new: true },
      )
      .select('subscription.translationSecondsBalance')
      .lean()
      .exec();

    if (decremented) {
      return decremented.subscription.translationSecondsBalance;
    }

    const clamped = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { 'subscription.translationSecondsBalance': 0 } },
        { new: true },
      )
      .select('subscription.translationSecondsBalance')
      .lean()
      .exec();

    return clamped?.subscription?.translationSecondsBalance ?? 0;
  }

  /** Lean lookup of multiple users by id, with the fields the map feature needs. */
  async findManyByIds(ids: string[]) {
    return this.userModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select(
        '_id name phoneNumber avatarUrl isOnline location locationUpdatedAt isGhostMode isSharingLocation',
      )
      .lean()
      .exec();
  }

  /**
   * Returns the `_id`s of users who are mutual contacts of `userId`:
   * users whose `phoneNumber` is in `userId`'s `syncedContacts` AND who in
   * turn have `userId`'s `phoneNumber` in their own `syncedContacts`.
   */
  async findMutualContactIds(userId: string): Promise<Types.ObjectId[]> {
    const user = await this.userModel
      .findById(userId)
      .select('phoneNumber syncedContacts')
      .lean()
      .exec();
    if (!user || !user.syncedContacts?.length) return [];

    const mutuals = await this.userModel
      .find({
        _id: { $ne: new Types.ObjectId(userId) },
        phoneNumber: { $in: user.syncedContacts },
        syncedContacts: user.phoneNumber,
      })
      .select('_id')
      .lean()
      .exec();

    return mutuals.map((m) => m._id);
  }

  /**
   * 018-snap-map-realtime: `allowedUserIds` scopes results to the caller's
   * authorized set (SC-001/008) — never return strangers regardless of
   * distance. Ghost-mode users and locations stale beyond the 24h freshness
   * window (R5) are excluded.
   */
  async getNearbyUsers(
    userId: string,
    lng: number,
    lat: number,
    maxDistanceKm: number,
    allowedUserIds: string[],
  ) {
    if (!allowedUserIds.length) return [];
    const maxDistanceMeters = maxDistanceKm * 1000;
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const users = await this.userModel
      .find({
        _id: {
          $ne: userId,
          $in: allowedUserIds.map((id) => new Types.ObjectId(id)),
        },
        isGhostMode: { $ne: true },
        isSharingLocation: true,
        locationUpdatedAt: { $gte: staleBefore },
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
            $maxDistance: maxDistanceMeters,
          },
        },
      })
      .select(
        '_id name phoneNumber avatarUrl location isOnline locationUpdatedAt',
      )
      .lean()
      .exec();

    if (!users.length) return users;

    // 014-status-feature-integration (T051): flag users with an active
    // 'showOnMap' status so the map UI can surface a status indicator.
    const activeStatuses = await this.statusModel
      .find({
        authorId: { $in: users.map((u) => u._id) },
        privacy: StatusPrivacy.SHOW_ON_MAP,
        expiresAt: { $gt: new Date() },
      })
      .select('authorId')
      .lean()
      .exec();
    const authorsWithStatus = new Set(
      activeStatuses.map((s) => s.authorId.toString()),
    );

    return users.map((u) => ({
      ...u,
      hasActiveStatus: authorsWithStatus.has(u._id.toString()),
    }));
  }
}
