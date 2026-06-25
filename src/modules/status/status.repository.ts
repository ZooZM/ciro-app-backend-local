import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../common/repositories/base.repository';
import { UsersRepository } from '../users/users.repository';
import { Status, StatusDocument, StatusPrivacy } from './schemas/status.schema';

@Injectable()
export class StatusRepository extends BaseRepository<StatusDocument> {
  constructor(
    @InjectModel(Status.name)
    private readonly statusModel: Model<StatusDocument>,
    private readonly usersRepository: UsersRepository,
  ) {
    super(statusModel);
  }

  async findByClientStatusId(
    clientStatusId: string,
  ): Promise<StatusDocument | null> {
    return this.findOne({ clientStatusId });
  }

  /** Returns the status only if it has not yet expired (FR-008/SC-002). */
  async findActiveById(statusId: string): Promise<StatusDocument | null> {
    return this.statusModel
      .findOne({ _id: statusId, expiresAt: { $gt: new Date() } })
      .exec();
  }

  async findFeedForUser(userId: string): Promise<StatusDocument[]> {
    const mutualContactIds =
      await this.usersRepository.findMutualContactIds(userId);
    const userObjectId = new Types.ObjectId(userId);

    return this.statusModel
      .find({
        expiresAt: { $gt: new Date() },
        $or: [
          { authorId: userObjectId },
          {
            privacy: { $in: [StatusPrivacy.PUBLIC, StatusPrivacy.SHOW_ON_MAP] },
            authorId: { $in: mutualContactIds },
          },
          { privacy: StatusPrivacy.PRIVATE, audience: userObjectId },
        ],
      })
      .sort({ createdAt: -1 })
      .populate('authorId', 'name avatarUrl')
      .exec();
  }

  async findViewersByStatusId(
    statusId: string,
  ): Promise<StatusDocument | null> {
    return this.statusModel
      .findOne({ _id: statusId, expiresAt: { $gt: new Date() } })
      .populate('views.userId', 'name avatarUrl')
      .exec();
  }

  async findReactionsByStatusId(
    statusId: string,
  ): Promise<StatusDocument | null> {
    return this.statusModel
      .findOne({ _id: statusId, expiresAt: { $gt: new Date() } })
      .populate('reactions.userId', 'name avatarUrl')
      .exec();
  }

  /**
   * Adds a view if this user hasn't viewed before (first `viewedAt` wins,
   * mirrors `MessagesRepository.markRead`'s `$addToSet`). Returns the updated
   * document if a new view was added, or `null` if the user had already
   * viewed this status.
   */
  async upsertView(
    statusId: string,
    userId: string,
    viewedAt: Date,
  ): Promise<StatusDocument | null> {
    return this.statusModel
      .findOneAndUpdate(
        {
          _id: statusId,
          'views.userId': { $ne: new Types.ObjectId(userId) },
        },
        { $push: { views: { userId: new Types.ObjectId(userId), viewedAt } } },
        { new: true },
      )
      .exec();
  }

  /**
   * Replaces the caller's prior reaction (if any) on this status, or adds a
   * new one.
   */
  async upsertReaction(
    statusId: string,
    userId: string,
    reaction: string,
    createdAt: Date,
  ): Promise<StatusDocument | null> {
    const userObjectId = new Types.ObjectId(userId);

    const updated = await this.statusModel
      .findOneAndUpdate(
        { _id: statusId, 'reactions.userId': userObjectId },
        {
          $set: {
            'reactions.$.reaction': reaction,
            'reactions.$.createdAt': createdAt,
          },
        },
        { new: true },
      )
      .exec();

    if (updated) return updated;

    return this.statusModel
      .findOneAndUpdate(
        { _id: statusId },
        {
          $push: { reactions: { userId: userObjectId, reaction, createdAt } },
        },
        { new: true },
      )
      .exec();
  }

  /** Validates that every entry in `audience` is one of the author's mutual contacts. */
  isAudienceSubsetOfMutualContacts(
    audience: string[],
    mutualContactIds: Types.ObjectId[],
  ): boolean {
    const mutualSet = new Set(mutualContactIds.map((id) => id.toString()));
    return audience.every((id) => mutualSet.has(id));
  }
}
