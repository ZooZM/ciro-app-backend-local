import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { User, UserDocument } from '../users/schemas/user.schema';
import { REELS_REPOSITORY } from './reels.repository';
import type { ReelsRepository } from './reels.repository';
import { FeedQueryDto, CommentsQueryDto } from './dto/feed-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { ReelsNotificationsService } from './reels-notifications.service';
import { parseHashtagsAndMentions } from './reels-text.util';
import { REELS_MODERATION_QUEUE } from './reels-moderation.processor';

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    @Inject(REELS_REPOSITORY) private readonly repository: ReelsRepository,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notifications: ReelsNotificationsService,
    @InjectQueue(REELS_MODERATION_QUEUE)
    private readonly moderationQueue: Queue,
  ) {}

  /**
   * v3 (FR-060/FR-062): creates the reel as `pending_moderation` and
   * enqueues the background moderation job. R17/plan rule 8: enqueue
   * failure (e.g. Redis briefly down) MUST NOT fail the upload — the reel
   * stays pending and the worker's boot/interval sweep picks it up later
   * (fail-closed, never fail-open).
   */
  async createReel(params: {
    creatorId: string;
    videoUrl: string;
    thumbnailUrl: string;
    description: string;
  }) {
    const { hashtags, mentions } = await parseHashtagsAndMentions(
      params.description,
      this.userModel,
    );
    const reel = await this.repository.createReel({
      creatorId: params.creatorId,
      videoUrl: params.videoUrl,
      thumbnailUrl: params.thumbnailUrl,
      description: params.description,
      hashtags,
      mentions,
    });
    try {
      await this.moderationQueue.add(
        'moderate',
        { reelId: reel.id },
        {
          jobId: reel.id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
        },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue moderation job for reel ${reel.id}: ${(err as Error).message} — sweep will retry`,
      );
    }
    return reel;
  }

  /**
   * FR-052/053: the caller's mutual block set — their own `blockedUsers`
   * plus everyone who has blocked them (reverse lookup via the multikey
   * index on `blockedUsers`). Applied to every read below; never enforced
   * client-side.
   */
  private async getBlockSet(viewerId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(viewerId)) return [];
    const viewerObjectId = new Types.ObjectId(viewerId);
    const [viewer, reverseBlockers] = await Promise.all([
      this.userModel
        .findById(viewerObjectId)
        .select('blockedUsers')
        .lean()
        .exec(),
      this.userModel
        .find({ blockedUsers: viewerObjectId })
        .select('_id')
        .lean()
        .exec(),
    ]);
    const own = (viewer?.blockedUsers ?? []).map((id) => id.toString());
    const reverse = reverseBlockers.map((u) => u._id.toString());
    return [...new Set([...own, ...reverse])];
  }

  async getFeed(viewerId: string, query: FeedQueryDto) {
    const excludeCreatorIds = await this.getBlockSet(viewerId);
    return this.repository.listFeed({
      viewerId,
      cursor: query.cursor,
      limit: query.limit ?? 10,
      creatorId: query.creatorId,
      hashtag: query.hashtag,
      excludeCreatorIds,
    });
  }

  async getReel(id: string, viewerId: string) {
    const excludeCreatorIds = await this.getBlockSet(viewerId);
    const reel = await this.repository.getReel(id, viewerId, excludeCreatorIds);
    if (!reel) throw new NotFoundException('Reel not found');
    return reel;
  }

  async toggleLike(id: string, viewerId: string) {
    const result = await this.repository.toggleLike(id, viewerId);
    if (!result) throw new NotFoundException('Reel not found');
    if (result.liked) {
      await this.notifications.notifyReelLike({
        actorId: viewerId,
        recipientId: result.reel.creatorId,
        reelId: result.reel.id,
      });
    }
    return { liked: result.liked, likesCount: result.likesCount };
  }

  async getComments(id: string, viewerId: string, query: CommentsQueryDto) {
    const excludeAuthorIds = await this.getBlockSet(viewerId);
    const result = await this.repository.listComments(id, {
      cursor: query.cursor,
      limit: query.limit ?? 20,
      excludeAuthorIds,
    });
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async addComment(id: string, viewerId: string, text: string) {
    const result = await this.repository.addComment(id, viewerId, text);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async recordShare(id: string, viewerId: string) {
    const result = await this.repository.recordShare(id, viewerId);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  async getProfile(userId: string, viewerId: string) {
    const excludeCreatorIds = await this.getBlockSet(viewerId);
    const profile = await this.repository.getProfile(
      userId,
      viewerId,
      excludeCreatorIds,
    );
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  async toggleFollow(userId: string, viewerId: string) {
    const result = await this.repository.toggleFollow(userId, viewerId);
    if (result === 'self') {
      throw new BadRequestException('Cannot follow yourself');
    }
    if (!result) throw new NotFoundException('User not found');
    if (result.following) {
      await this.notifications.notifyNewFollower({
        actorId: viewerId,
        recipientId: userId,
      });
    }
    return result;
  }

  /** FR-048: dedup per (userId, videoId); recorded once per reel per user. */
  async recordView(id: string, viewerId: string) {
    const result = await this.repository.recordView(id, viewerId);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  /** FR-049: private toggle, no public counter. */
  async toggleSave(id: string, viewerId: string) {
    const result = await this.repository.toggleSave(id, viewerId);
    if (!result) throw new NotFoundException('Reel not found');
    return result;
  }

  /** FR-051. */
  async getLiked(viewerId: string, query: FeedQueryDto) {
    const excludeCreatorIds = await this.getBlockSet(viewerId);
    return this.repository.listLiked(viewerId, {
      cursor: query.cursor,
      limit: query.limit ?? 10,
      excludeCreatorIds,
    });
  }

  /** FR-050. */
  async getSaved(viewerId: string, query: FeedQueryDto) {
    const excludeCreatorIds = await this.getBlockSet(viewerId);
    return this.repository.listSaved(viewerId, {
      cursor: query.cursor,
      limit: query.limit ?? 10,
      excludeCreatorIds,
    });
  }

  /** FR-057: hashtag substring search, block-filtered (FR-059). */
  async searchReels(viewerId: string, query: SearchQueryDto) {
    const excludeCreatorIds = await this.getBlockSet(viewerId);
    return this.repository.searchReels({
      viewerId,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit ?? 10,
      excludeCreatorIds,
    });
  }

  /** FR-057: username/name substring search, excludes caller + block set (FR-059). */
  async searchUsers(viewerId: string, query: SearchQueryDto) {
    const excludeUserIds = await this.getBlockSet(viewerId);
    return this.repository.searchUsers({
      viewerId,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit ?? 10,
      excludeUserIds,
    });
  }

  /** FR-052: directed block, toggled on the shared `User.blockedUsers` list. */
  async toggleBlock(targetId: string, viewerId: string) {
    if (targetId === viewerId) {
      throw new BadRequestException('Cannot block yourself');
    }
    if (!Types.ObjectId.isValid(targetId)) {
      throw new NotFoundException('User not found');
    }
    const target = await this.userModel.findById(targetId).exec();
    if (!target) throw new NotFoundException('User not found');

    const viewerObjectId = new Types.ObjectId(viewerId);
    const targetObjectId = new Types.ObjectId(targetId);
    const viewer = await this.userModel.findById(viewerObjectId).exec();
    if (!viewer) throw new NotFoundException('User not found');

    const alreadyBlocked = viewer.blockedUsers.some((id) =>
      id.equals(targetObjectId),
    );
    if (alreadyBlocked) {
      await this.userModel
        .updateOne(
          { _id: viewerObjectId },
          { $pull: { blockedUsers: targetObjectId } },
        )
        .exec();
      return { blocked: false };
    }
    await this.userModel
      .updateOne(
        { _id: viewerObjectId },
        { $addToSet: { blockedUsers: targetObjectId } },
      )
      .exec();
    return { blocked: true };
  }

  /** v3 (FR-067): owner-only cascade delete, any status. */
  async deleteReel(id: string, viewerId: string) {
    const result = await this.repository.deleteReel(id, viewerId);
    if (result === null) throw new NotFoundException('Reel not found');
    if (result === 'forbidden') {
      throw new ForbiddenException('Only the owner can delete this reel');
    }
    return { deleted: true as const };
  }
}
