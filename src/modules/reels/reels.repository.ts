/**
 * Abstract data-access contract for the Reels feature (specs/021-reels-video-feed).
 *
 * Bound to `ReelsMockStore` in `reels.module.ts` for v1 (FR-032/FR-033). The
 * relational shape here (users/videos/likes/comments/shares/follows) is
 * designed so a Mongoose-backed implementation can replace the mock store
 * later without touching `ReelsService` or the controllers.
 */

export interface ReelCreatorRecord {
  id: string;
  name: string;
  avatarUrl: string;
  bio: string;
}

export interface ReelVideoRecord {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface ReelCommentRecord {
  id: string;
  videoId: string;
  authorId: string;
  text: string;
  createdAt: string;
}

export interface ReelDto {
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  createdAt: string;
  creator: {
    id: string;
    name: string;
    avatarUrl: string;
    viewerFollowing: boolean;
  };
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewerLiked: boolean;
}

export interface CommentDto {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  text: string;
  createdAt: string;
}

export interface CreatorProfileDto {
  user: { id: string; name: string; avatarUrl: string; bio: string };
  stats: { followers: number; following: number; totalLikes: number };
  videos: { id: string; thumbnailUrl: string }[];
  viewer: { following: boolean; isSelf: boolean };
}

export const REELS_REPOSITORY = Symbol('REELS_REPOSITORY');

export interface ReelsRepository {
  /** FR-007/FR-009: main feed loops the catalog (nextCursor never null); creator-scoped feed is finite. */
  listFeed(params: {
    viewerId: string;
    cursor?: string;
    limit: number;
    creatorId?: string;
  }): Promise<{ items: ReelDto[]; nextCursor: string | null }>;

  getReel(id: string, viewerId: string): Promise<ReelDto | null>;

  toggleLike(id: string, viewerId: string): Promise<{ liked: boolean; likesCount: number } | null>;

  listComments(
    id: string,
    params: { cursor?: string; limit: number },
  ): Promise<{ items: CommentDto[]; nextCursor: string | null; commentsCount: number } | null>;

  addComment(
    id: string,
    viewerId: string,
    text: string,
  ): Promise<{ comment: CommentDto; commentsCount: number } | null>;

  recordShare(id: string, viewerId: string): Promise<{ sharesCount: number } | null>;

  getProfile(userId: string, viewerId: string): Promise<CreatorProfileDto | null>;

  toggleFollow(
    userId: string,
    viewerId: string,
  ): Promise<{ following: boolean; followersCount: number } | 'self' | null>;
}
