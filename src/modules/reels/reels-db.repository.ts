import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Reel, ReelDocument } from './schemas/reel.schema';
import { ReelLike, ReelLikeDocument } from './schemas/reel-like.schema';
import { ReelSave, ReelSaveDocument } from './schemas/reel-save.schema';
import { ReelView, ReelViewDocument } from './schemas/reel-view.schema';
import { ReelShare, ReelShareDocument } from './schemas/reel-share.schema';
import {
  ReelComment,
  ReelCommentDocument,
} from './schemas/reel-comment.schema';
import { Follow, FollowDocument } from './schemas/follow.schema';
import {
  CommentDto,
  CreatorProfileDto,
  ReelDto,
  ReelsRepository,
  ReelVideoRecord,
  UserSearchResultDto,
} from './reels.repository';

/**
 * Mongoose-backed `ReelsRepository` (v2 — replaces `ReelsMockStore`).
 *
 * Cursor convention (unchanged from v1 mock): an opaque, ever-increasing
 * integer offset encoded as a string. The main feed wraps the offset modulo
 * the catalog size so `nextCursor` is never null (FR-007); scoped
 * feeds/lists (creator, hashtag, liked, saved, search) are finite and stop
 * once the offset reaches the filtered count.
 */
@Injectable()
export class ReelsDbRepository implements ReelsRepository {
  constructor(
    @InjectModel(Reel.name) private readonly reelModel: Model<ReelDocument>,
    @InjectModel(ReelLike.name)
    private readonly likeModel: Model<ReelLikeDocument>,
    @InjectModel(ReelSave.name)
    private readonly saveModel: Model<ReelSaveDocument>,
    @InjectModel(ReelView.name)
    private readonly viewModel: Model<ReelViewDocument>,
    @InjectModel(ReelShare.name)
    private readonly shareModel: Model<ReelShareDocument>,
    @InjectModel(ReelComment.name)
    private readonly commentModel: Model<ReelCommentDocument>,
    @InjectModel(Follow.name)
    private readonly followModel: Model<FollowDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // ── Id helpers ─────────────────────────────────────────────────────────

  private toObjectId(id: string): Types.ObjectId | null {
    if (!Types.ObjectId.isValid(id)) return null;
    return new Types.ObjectId(id);
  }

  private parseCursor(cursor: string | undefined): number {
    if (cursor === undefined) return 0;
    const parsed = Number(cursor);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException('Invalid cursor');
    }
    return parsed;
  }

  // ── Hydration (raw docs -> ReelDto, batched to avoid N+1) ───────────────

  private async hydrate(
    reels: ReelDocument[],
    viewerId: string,
  ): Promise<ReelDto[]> {
    if (reels.length === 0) return [];
    const viewerObjectId = this.toObjectId(viewerId);
    const creatorIds = [...new Set(reels.map((r) => r.creatorId.toString()))];
    const videoIds = reels.map((r) => r._id);

    const [creators, followed, liked, saved] = await Promise.all([
      this.userModel
        .find({ _id: { $in: creatorIds.map((id) => new Types.ObjectId(id)) } })
        .select('_id name username avatarUrl')
        .lean()
        .exec(),
      viewerObjectId
        ? this.followModel
            .find({
              followerId: viewerObjectId,
              followeeId: {
                $in: creatorIds.map((id) => new Types.ObjectId(id)),
              },
            })
            .lean()
            .exec()
        : [],
      viewerObjectId
        ? this.likeModel
            .find({ userId: viewerObjectId, videoId: { $in: videoIds } })
            .lean()
            .exec()
        : [],
      viewerObjectId
        ? this.saveModel
            .find({ userId: viewerObjectId, videoId: { $in: videoIds } })
            .lean()
            .exec()
        : [],
    ]);

    const creatorById = new Map(creators.map((c) => [c._id.toString(), c]));
    const followedSet = new Set(followed.map((f) => f.followeeId.toString()));
    const likedSet = new Set(liked.map((l) => l.videoId.toString()));
    const savedSet = new Set(saved.map((s) => s.videoId.toString()));

    return reels.map((r) => {
      const creator = creatorById.get(r.creatorId.toString());
      return {
        id: r._id.toString(),
        videoUrl: r.videoUrl,
        thumbnailUrl: r.thumbnailUrl,
        createdAt: (r.createdAt as Date).toISOString(),
        description: r.description,
        hashtags: r.hashtags,
        mentions: r.mentions.map((m) => ({
          userId: m.userId.toString(),
          username: m.username,
        })),
        creator: {
          id: r.creatorId.toString(),
          name: creator?.name ?? 'Unknown',
          username: creator?.username ?? '',
          avatarUrl: creator?.avatarUrl ?? '',
          viewerFollowing: followedSet.has(r.creatorId.toString()),
        },
        viewsCount: r.viewsCount,
        likesCount: r.likesCount,
        commentsCount: r.commentsCount,
        sharesCount: r.sharesCount,
        viewerLiked: likedSet.has(r._id.toString()),
        viewerSaved: savedSet.has(r._id.toString()),
      };
    });
  }

  private toRecord(r: ReelDocument): ReelVideoRecord {
    return {
      id: r._id.toString(),
      creatorId: r.creatorId.toString(),
      videoUrl: r.videoUrl,
      thumbnailUrl: r.thumbnailUrl,
      description: r.description,
      hashtags: r.hashtags,
      mentions: r.mentions.map((m) => ({
        userId: m.userId.toString(),
        username: m.username,
      })),
      createdAt: (r.createdAt as Date).toISOString(),
    };
  }

  private excludeFilter(excludeCreatorIds: string[]) {
    if (excludeCreatorIds.length === 0) return {};
    return {
      creatorId: {
        $nin: excludeCreatorIds
          .map((id) => this.toObjectId(id))
          .filter((id): id is Types.ObjectId => id !== null),
      },
    };
  }

  // ── ReelsRepository ────────────────────────────────────────────────────

  async listFeed(params: {
    viewerId: string;
    cursor?: string;
    limit: number;
    creatorId?: string;
    hashtag?: string;
    excludeCreatorIds: string[];
  }): Promise<{ items: ReelDto[]; nextCursor: string | null }> {
    const offset = this.parseCursor(params.cursor);
    const filter: Record<string, unknown> = {};

    if (params.creatorId) {
      // A specific creatorId and the $nin exclusion both target the same
      // field — they can't be merged. If the requested creator is blocked,
      // the scoped feed is simply empty (FR-053); otherwise filter by the
      // exact id (no need for $nin against a single already-known-safe id).
      if (params.excludeCreatorIds.includes(params.creatorId)) {
        return { items: [], nextCursor: null };
      }
      const creatorObjectId = this.toObjectId(params.creatorId);
      if (!creatorObjectId) return { items: [], nextCursor: null };
      filter.creatorId = creatorObjectId;
    } else {
      Object.assign(filter, this.excludeFilter(params.excludeCreatorIds));
    }
    if (params.hashtag) {
      filter.hashtags = params.hashtag.toLowerCase();
    }

    const isScoped = Boolean(params.creatorId || params.hashtag);
    const total = await this.reelModel.countDocuments(filter).exec();
    if (total === 0) return { items: [], nextCursor: null };

    if (isScoped) {
      // Finite: creator-scoped and hashtag-scoped feeds terminate (FR-007 clarification, FR-047a).
      const docs = await this.reelModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(offset)
        .limit(params.limit)
        .exec();
      const nextOffset = offset + params.limit;
      return {
        items: await this.hydrate(docs, params.viewerId),
        nextCursor: nextOffset < total ? String(nextOffset) : null,
      };
    }

    // Main feed loops the catalog indefinitely — nextCursor is never null (FR-007).
    const docs: ReelDocument[] = [];
    const sorted = await this.reelModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .exec();
    for (let i = 0; i < params.limit; i++) {
      docs.push(sorted[(offset + i) % sorted.length]);
    }
    return {
      items: await this.hydrate(docs, params.viewerId),
      nextCursor: String(offset + params.limit),
    };
  }

  async getReel(
    id: string,
    viewerId: string,
    excludeCreatorIds: string[],
  ): Promise<ReelDto | null> {
    const objectId = this.toObjectId(id);
    if (!objectId) return null;
    const doc = await this.reelModel
      .findOne({ _id: objectId, ...this.excludeFilter(excludeCreatorIds) })
      .exec();
    if (!doc) return null;
    const [hydrated] = await this.hydrate([doc], viewerId);
    return hydrated;
  }

  async toggleLike(
    id: string,
    viewerId: string,
  ): Promise<{
    liked: boolean;
    likesCount: number;
    reel: ReelVideoRecord;
  } | null> {
    const videoId = this.toObjectId(id);
    const userId = this.toObjectId(viewerId);
    if (!videoId || !userId) return null;
    const reel = await this.reelModel.findById(videoId).exec();
    if (!reel) return null;

    const existing = await this.likeModel
      .findOneAndDelete({ userId, videoId })
      .exec();

    let liked: boolean;
    if (existing) {
      liked = false;
      reel.likesCount = Math.max(0, reel.likesCount - 1);
      await this.userModel
        .updateOne({ _id: reel.creatorId }, { $inc: { totalLikes: -1 } })
        .exec();
    } else {
      try {
        await this.likeModel.create({ userId, videoId });
        liked = true;
        reel.likesCount += 1;
        await this.userModel
          .updateOne({ _id: reel.creatorId }, { $inc: { totalLikes: 1 } })
          .exec();
      } catch {
        // Duplicate-key race (rapid double-tap) — another request already
        // inserted the like; treat as already-liked, no double count.
        liked = true;
      }
    }
    await reel.save();

    return {
      liked,
      likesCount: reel.likesCount,
      reel: this.toRecord(reel),
    };
  }

  async listComments(
    id: string,
    params: { cursor?: string; limit: number; excludeAuthorIds: string[] },
  ): Promise<{
    items: CommentDto[];
    nextCursor: string | null;
    commentsCount: number;
  } | null> {
    const videoId = this.toObjectId(id);
    if (!videoId) return null;
    const reel = await this.reelModel.findById(videoId).exec();
    if (!reel) return null;

    const offset = this.parseCursor(params.cursor);
    const filter: Record<string, unknown> = { videoId };
    if (params.excludeAuthorIds.length > 0) {
      filter.authorId = {
        $nin: params.excludeAuthorIds
          .map((aid) => this.toObjectId(aid))
          .filter((aid): aid is Types.ObjectId => aid !== null),
      };
    }
    const total = await this.commentModel.countDocuments(filter).exec();
    const docs = await this.commentModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(params.limit)
      .exec();

    const authorIds = [...new Set(docs.map((d) => d.authorId.toString()))];
    const authors = await this.userModel
      .find({ _id: { $in: authorIds.map((aid) => new Types.ObjectId(aid)) } })
      .select('_id name avatarUrl')
      .lean()
      .exec();
    const authorById = new Map(authors.map((a) => [a._id.toString(), a]));

    const nextOffset = offset + params.limit;
    return {
      items: docs.map((c) => {
        const author = authorById.get(c.authorId.toString());
        return {
          id: c._id.toString(),
          authorId: c.authorId.toString(),
          authorName: author?.name ?? 'Unknown',
          authorAvatarUrl: author?.avatarUrl ?? '',
          text: c.text,
          createdAt: (c.createdAt as Date).toISOString(),
        };
      }),
      nextCursor: nextOffset < total ? String(nextOffset) : null,
      commentsCount: reel.commentsCount,
    };
  }

  async addComment(
    id: string,
    viewerId: string,
    text: string,
  ): Promise<{ comment: CommentDto; commentsCount: number } | null> {
    const videoId = this.toObjectId(id);
    const authorId = this.toObjectId(viewerId);
    if (!videoId || !authorId) return null;
    const reel = await this.reelModel.findById(videoId).exec();
    if (!reel) return null;

    const created = await this.commentModel.create({ videoId, authorId, text });
    reel.commentsCount += 1;
    await reel.save();

    const author = await this.userModel
      .findById(authorId)
      .select('name avatarUrl')
      .lean()
      .exec();

    return {
      comment: {
        id: created._id.toString(),
        authorId: viewerId,
        authorName: author?.name ?? 'Unknown',
        authorAvatarUrl: author?.avatarUrl ?? '',
        text: created.text,
        createdAt: (created.createdAt as Date).toISOString(),
      },
      commentsCount: reel.commentsCount,
    };
  }

  async recordShare(
    id: string,
    viewerId: string,
  ): Promise<{ sharesCount: number } | null> {
    const videoId = this.toObjectId(id);
    const userId = this.toObjectId(viewerId);
    if (!videoId || !userId) return null;
    const reel = await this.reelModel.findById(videoId).exec();
    if (!reel) return null;

    await this.shareModel.create({ userId, videoId });
    reel.sharesCount += 1;
    await reel.save();
    return { sharesCount: reel.sharesCount };
  }

  async getProfile(
    userId: string,
    viewerId: string,
    excludeCreatorIds: string[],
  ): Promise<CreatorProfileDto | null> {
    const targetId = this.toObjectId(userId);
    if (!targetId) return null;
    if (excludeCreatorIds.includes(userId)) return null;

    const user = await this.userModel.findById(targetId).exec();
    if (!user) return null;

    const viewerObjectId = this.toObjectId(viewerId);
    const videos = await this.reelModel
      .find({ creatorId: targetId })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id thumbnailUrl')
      .lean()
      .exec();
    const isFollowing = viewerObjectId
      ? Boolean(
          await this.followModel
            .exists({ followerId: viewerObjectId, followeeId: targetId })
            .exec(),
        )
      : false;

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        username: user.username ?? '',
        avatarUrl: user.avatarUrl ?? '',
        bio: user.bio ?? '',
      },
      stats: {
        followers: user.followersCount,
        following: user.followingCount,
        totalLikes: user.totalLikes,
      },
      videos: videos.map((v) => ({
        id: v._id.toString(),
        thumbnailUrl: v.thumbnailUrl,
      })),
      viewer: {
        following: isFollowing,
        isSelf: userId === viewerId,
      },
    };
  }

  async toggleFollow(
    userId: string,
    viewerId: string,
  ): Promise<{ following: boolean; followersCount: number } | 'self' | null> {
    if (userId === viewerId) return 'self';
    const followeeId = this.toObjectId(userId);
    const followerId = this.toObjectId(viewerId);
    if (!followeeId || !followerId) return null;
    const followee = await this.userModel.findById(followeeId).exec();
    if (!followee) return null;

    const existing = await this.followModel
      .findOneAndDelete({ followerId, followeeId })
      .exec();

    let following: boolean;
    if (existing) {
      following = false;
      await this.userModel
        .updateOne({ _id: followeeId }, { $inc: { followersCount: -1 } })
        .exec();
      await this.userModel
        .updateOne({ _id: followerId }, { $inc: { followingCount: -1 } })
        .exec();
      followee.followersCount = Math.max(0, followee.followersCount - 1);
    } else {
      try {
        await this.followModel.create({ followerId, followeeId });
        following = true;
        await this.userModel
          .updateOne({ _id: followeeId }, { $inc: { followersCount: 1 } })
          .exec();
        await this.userModel
          .updateOne({ _id: followerId }, { $inc: { followingCount: 1 } })
          .exec();
        followee.followersCount += 1;
      } catch {
        following = true;
      }
    }

    return { following, followersCount: followee.followersCount };
  }

  async recordView(
    id: string,
    viewerId: string,
  ): Promise<{ viewsCount: number } | null> {
    const videoId = this.toObjectId(id);
    const userId = this.toObjectId(viewerId);
    if (!videoId || !userId) return null;
    const reel = await this.reelModel.findById(videoId).exec();
    if (!reel) return null;

    try {
      await this.viewModel.create({ userId, videoId });
      reel.viewsCount += 1;
      await reel.save();
    } catch {
      // Duplicate-key: already viewed by this user — no increment (FR-048 dedup).
    }
    return { viewsCount: reel.viewsCount };
  }

  async toggleSave(
    id: string,
    viewerId: string,
  ): Promise<{ saved: boolean } | null> {
    const videoId = this.toObjectId(id);
    const userId = this.toObjectId(viewerId);
    if (!videoId || !userId) return null;
    const reel = await this.reelModel.findById(videoId).exec();
    if (!reel) return null;

    const existing = await this.saveModel
      .findOneAndDelete({ userId, videoId })
      .exec();
    if (existing) return { saved: false };

    try {
      await this.saveModel.create({ userId, videoId });
      return { saved: true };
    } catch {
      return { saved: true };
    }
  }

  async listLiked(
    viewerId: string,
    params: { cursor?: string; limit: number; excludeCreatorIds: string[] },
  ): Promise<{ items: ReelDto[]; nextCursor: string | null }> {
    return this.listByRelation(this.likeModel, viewerId, params);
  }

  async listSaved(
    viewerId: string,
    params: { cursor?: string; limit: number; excludeCreatorIds: string[] },
  ): Promise<{ items: ReelDto[]; nextCursor: string | null }> {
    return this.listByRelation(this.saveModel, viewerId, params);
  }

  /** Shared implementation for listLiked/listSaved: relation-recency order, hydrated, block-filtered. */
  private async listByRelation(
    relationModel: Model<ReelLikeDocument> | Model<ReelSaveDocument>,
    viewerId: string,
    params: { cursor?: string; limit: number; excludeCreatorIds: string[] },
  ): Promise<{ items: ReelDto[]; nextCursor: string | null }> {
    const userId = this.toObjectId(viewerId);
    if (!userId) return { items: [], nextCursor: null };
    const offset = this.parseCursor(params.cursor);

    const total = await relationModel.countDocuments({ userId }).exec();
    if (total === 0) return { items: [], nextCursor: null };

    const relations = await relationModel
      .find({ userId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(params.limit)
      .lean()
      .exec();
    const videoIds = relations.map((r) => r.videoId);
    const reels = await this.reelModel
      .find({
        _id: { $in: videoIds },
        ...this.excludeFilter(params.excludeCreatorIds),
      })
      .exec();
    const reelById = new Map<string, ReelDocument>(
      reels.map((r) => [r._id.toString(), r as unknown as ReelDocument]),
    );
    // Preserve relation-recency order; drop any reel excluded by the block filter.
    const ordered = videoIds
      .map((id) => reelById.get(id.toString()))
      .filter((r) => r !== undefined);

    const nextOffset = offset + params.limit;
    return {
      items: await this.hydrate(ordered, viewerId),
      nextCursor: nextOffset < total ? String(nextOffset) : null,
    };
  }

  async searchReels(params: {
    viewerId: string;
    q: string;
    cursor?: string;
    limit: number;
    excludeCreatorIds: string[];
  }): Promise<{ items: ReelDto[]; nextCursor: string | null }> {
    const offset = this.parseCursor(params.cursor);
    const escaped = params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = {
      hashtags: { $regex: escaped, $options: 'i' },
      ...this.excludeFilter(params.excludeCreatorIds),
    };
    const total = await this.reelModel.countDocuments(filter).exec();
    if (total === 0) return { items: [], nextCursor: null };
    const docs = await this.reelModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(params.limit)
      .exec();
    const nextOffset = offset + params.limit;
    return {
      items: await this.hydrate(docs, params.viewerId),
      nextCursor: nextOffset < total ? String(nextOffset) : null,
    };
  }

  async searchUsers(params: {
    viewerId: string;
    q: string;
    cursor?: string;
    limit: number;
    excludeUserIds: string[];
  }): Promise<{ items: UserSearchResultDto[]; nextCursor: string | null }> {
    const offset = this.parseCursor(params.cursor);
    const escaped = params.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const excludeIds = [params.viewerId, ...params.excludeUserIds]
      .map((id) => this.toObjectId(id))
      .filter((id): id is Types.ObjectId => id !== null);
    const filter = {
      _id: { $nin: excludeIds },
      $or: [
        { username: { $regex: escaped, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
      ],
    };
    const total = await this.userModel.countDocuments(filter).exec();
    if (total === 0) return { items: [], nextCursor: null };
    const docs = await this.userModel
      .find(filter)
      .sort({ name: 1, _id: 1 })
      .skip(offset)
      .limit(params.limit)
      .lean()
      .exec();

    const viewerObjectId = this.toObjectId(params.viewerId);
    const followed = viewerObjectId
      ? await this.followModel
          .find({
            followerId: viewerObjectId,
            followeeId: { $in: docs.map((d) => d._id) },
          })
          .lean()
          .exec()
      : [];
    const followedSet = new Set(followed.map((f) => f.followeeId.toString()));

    const nextOffset = offset + params.limit;
    return {
      items: docs.map((u) => ({
        id: u._id.toString(),
        username: u.username ?? '',
        name: u.name,
        avatarUrl: u.avatarUrl ?? '',
        viewerFollowing: followedSet.has(u._id.toString()),
      })),
      nextCursor: nextOffset < total ? String(nextOffset) : null,
    };
  }
}
