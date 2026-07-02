import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CommentDto,
  CreatorProfileDto,
  ReelCommentRecord,
  ReelCreatorRecord,
  ReelDto,
  ReelVideoRecord,
  ReelsRepository,
} from '../reels.repository';
import { buildReelsSeed } from './reels-seed';

/**
 * In-memory relational store for the Reels feature (FR-032/FR-033).
 *
 * Not persisted across process restarts — this is intentional for v1 mock
 * data. Query helpers here are written so a future Mongoose-backed
 * `ReelsRepository` implementation can mirror the same joins/derivations.
 */
@Injectable()
export class ReelsMockStore implements ReelsRepository {
  private readonly users: ReelCreatorRecord[];
  private readonly videos: ReelVideoRecord[];
  private readonly likes: { userId: string; videoId: string }[];
  private readonly comments: ReelCommentRecord[];
  private readonly shares: {
    userId: string;
    videoId: string;
    createdAt: string;
  }[];
  private readonly follows: { followerId: string; followeeId: string }[];
  /** Master feed order: newest first, stable across the process lifetime. */
  private readonly feedOrder: ReelVideoRecord[];

  constructor() {
    const seed = buildReelsSeed();
    this.users = seed.users;
    this.videos = seed.videos;
    this.likes = seed.likes;
    this.comments = seed.comments;
    this.shares = seed.shares;
    this.follows = seed.follows;
    this.feedOrder = [...this.videos].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private findUser(id: string): ReelCreatorRecord | undefined {
    return this.users.find((u) => u.id === id);
  }

  private findVideo(id: string): ReelVideoRecord | undefined {
    return this.videos.find((v) => v.id === id);
  }

  private likesCount(videoId: string): number {
    return this.likes.filter((l) => l.videoId === videoId).length;
  }

  private commentsCount(videoId: string): number {
    return this.comments.filter((c) => c.videoId === videoId).length;
  }

  private sharesCount(videoId: string): number {
    return this.shares.filter((s) => s.videoId === videoId).length;
  }

  private followersCount(userId: string): number {
    return this.follows.filter((f) => f.followeeId === userId).length;
  }

  private followingCount(userId: string): number {
    return this.follows.filter((f) => f.followerId === userId).length;
  }

  private isFollowing(followerId: string, followeeId: string): boolean {
    return this.follows.some(
      (f) => f.followerId === followerId && f.followeeId === followeeId,
    );
  }

  private hasLiked(userId: string, videoId: string): boolean {
    return this.likes.some((l) => l.userId === userId && l.videoId === videoId);
  }

  private toReelDto(video: ReelVideoRecord, viewerId: string): ReelDto {
    const creator = this.findUser(video.creatorId);
    return {
      id: video.id,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      createdAt: video.createdAt,
      creator: {
        id: creator?.id ?? video.creatorId,
        name: creator?.name ?? 'Unknown',
        avatarUrl: creator?.avatarUrl ?? '',
        viewerFollowing: creator
          ? this.isFollowing(viewerId, creator.id)
          : false,
      },
      likesCount: this.likesCount(video.id),
      commentsCount: this.commentsCount(video.id),
      sharesCount: this.sharesCount(video.id),
      viewerLiked: this.hasLiked(viewerId, video.id),
    };
  }

  private toCommentDto(comment: ReelCommentRecord): CommentDto {
    const author = this.findUser(comment.authorId);
    return {
      id: comment.id,
      authorId: comment.authorId,
      authorName: author?.name ?? 'Unknown',
      authorAvatarUrl: author?.avatarUrl ?? '',
      text: comment.text,
      createdAt: comment.createdAt,
    };
  }

  /** Parses a pagination cursor into a non-negative integer offset. */
  private parseCursor(cursor: string | undefined): number {
    if (cursor === undefined) return 0;
    const parsed = Number(cursor);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException('Invalid cursor');
    }
    return parsed;
  }

  // ── ReelsRepository ────────────────────────────────────────────────────

  // Interface is async for future real-DB compatibility (FR-033); this mock is sync.
  // eslint-disable-next-line @typescript-eslint/require-await
  async listFeed(params: {
    viewerId: string;
    cursor?: string;
    limit: number;
    creatorId?: string;
  }): Promise<{ items: ReelDto[]; nextCursor: string | null }> {
    const offset = this.parseCursor(params.cursor);

    if (params.creatorId) {
      // Creator-scoped feed is finite (FR-007 clarification).
      const filtered = this.feedOrder.filter(
        (v) => v.creatorId === params.creatorId,
      );
      const page = filtered.slice(offset, offset + params.limit);
      const nextOffset = offset + params.limit;
      return {
        items: page.map((v) => this.toReelDto(v, params.viewerId)),
        nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
      };
    }

    // Main feed loops the catalog indefinitely — nextCursor is never null
    // (FR-007). `offset` is an ever-increasing sequence number; the actual
    // video is `feedOrder[offset % feedOrder.length]`.
    if (this.feedOrder.length === 0) {
      return { items: [], nextCursor: null };
    }
    const items: ReelDto[] = [];
    for (let i = 0; i < params.limit; i++) {
      const video = this.feedOrder[(offset + i) % this.feedOrder.length];
      items.push(this.toReelDto(video, params.viewerId));
    }
    return { items, nextCursor: String(offset + params.limit) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async getReel(id: string, viewerId: string): Promise<ReelDto | null> {
    const video = this.findVideo(id);
    return video ? this.toReelDto(video, viewerId) : null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async toggleLike(
    id: string,
    viewerId: string,
  ): Promise<{ liked: boolean; likesCount: number } | null> {
    const video = this.findVideo(id);
    if (!video) return null;
    const idx = this.likes.findIndex(
      (l) => l.userId === viewerId && l.videoId === id,
    );
    if (idx >= 0) {
      this.likes.splice(idx, 1);
    } else {
      this.likes.push({ userId: viewerId, videoId: id });
    }
    return { liked: idx < 0, likesCount: this.likesCount(id) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async listComments(
    id: string,
    params: { cursor?: string; limit: number },
  ): Promise<{
    items: CommentDto[];
    nextCursor: string | null;
    commentsCount: number;
  } | null> {
    const video = this.findVideo(id);
    if (!video) return null;
    const offset = this.parseCursor(params.cursor);
    const ordered = this.comments
      .filter((c) => c.videoId === id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    const page = ordered.slice(offset, offset + params.limit);
    const nextOffset = offset + params.limit;
    return {
      items: page.map((c) => this.toCommentDto(c)),
      nextCursor: nextOffset < ordered.length ? String(nextOffset) : null,
      commentsCount: ordered.length,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async addComment(
    id: string,
    viewerId: string,
    text: string,
  ): Promise<{ comment: CommentDto; commentsCount: number } | null> {
    const video = this.findVideo(id);
    if (!video) return null;
    const record: ReelCommentRecord = {
      id: randomUUID(),
      videoId: id,
      authorId: viewerId,
      text,
      createdAt: new Date().toISOString(),
    };
    this.comments.push(record);
    return {
      comment: this.toCommentDto(record),
      commentsCount: this.commentsCount(id),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async recordShare(
    id: string,
    viewerId: string,
  ): Promise<{ sharesCount: number } | null> {
    const video = this.findVideo(id);
    if (!video) return null;
    this.shares.push({
      userId: viewerId,
      videoId: id,
      createdAt: new Date().toISOString(),
    });
    return { sharesCount: this.sharesCount(id) };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async getProfile(
    userId: string,
    viewerId: string,
  ): Promise<CreatorProfileDto | null> {
    const user = this.findUser(userId);
    if (!user) return null;
    const creatorVideos = this.feedOrder.filter((v) => v.creatorId === userId);
    const totalLikes = creatorVideos.reduce(
      (sum, v) => sum + this.likesCount(v.id),
      0,
    );
    return {
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      },
      stats: {
        followers: this.followersCount(userId),
        following: this.followingCount(userId),
        totalLikes,
      },
      videos: creatorVideos.map((v) => ({
        id: v.id,
        thumbnailUrl: v.thumbnailUrl,
      })),
      viewer: {
        following: this.isFollowing(viewerId, userId),
        isSelf: userId === viewerId,
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- see listFeed
  async toggleFollow(
    userId: string,
    viewerId: string,
  ): Promise<{ following: boolean; followersCount: number } | 'self' | null> {
    if (userId === viewerId) return 'self';
    const user = this.findUser(userId);
    if (!user) return null;
    const idx = this.follows.findIndex(
      (f) => f.followerId === viewerId && f.followeeId === userId,
    );
    if (idx >= 0) {
      this.follows.splice(idx, 1);
    } else {
      this.follows.push({ followerId: viewerId, followeeId: userId });
    }
    return { following: idx < 0, followersCount: this.followersCount(userId) };
  }
}
