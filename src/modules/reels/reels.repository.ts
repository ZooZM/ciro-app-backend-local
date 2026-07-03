/**
 * Abstract data-access contract for the Reels feature (specs/021-reels-video-feed).
 *
 * v2: bound to `ReelsDbRepository` (Mongoose) in `reels.module.ts` — the
 * mock store has been retired (FR-032/FR-033, clarified: real database this
 * phase). The shape here is unchanged in spirit from v1 so `ReelsService`
 * and the controllers did not need to change their calling conventions.
 */

export interface ReelCreatorRecord {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  bio: string;
}

export interface ReelMentionRecord {
  userId: string;
  username: string;
}

export interface ReelVideoRecord {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  description: string;
  hashtags: string[];
  mentions: ReelMentionRecord[];
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
  description: string;
  hashtags: string[];
  mentions: ReelMentionRecord[];
  creator: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string;
    viewerFollowing: boolean;
  };
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewerLiked: boolean;
  viewerSaved: boolean;
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
  user: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string;
    bio: string;
  };
  stats: { followers: number; following: number; totalLikes: number };
  videos: { id: string; thumbnailUrl: string }[];
  viewer: { following: boolean; isSelf: boolean };
}

export interface UserSearchResultDto {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
  viewerFollowing: boolean;
}

export const REELS_REPOSITORY = Symbol('REELS_REPOSITORY');

export interface ReelsRepository {
  /**
   * FR-007/FR-009: main feed loops the catalog (nextCursor never null);
   * creator-scoped and hashtag-scoped feeds are finite.
   * FR-052/053: `excludeCreatorIds` is the caller's mutual block set —
   * excluded creators' reels never appear in the page.
   */
  listFeed(params: {
    viewerId: string;
    cursor?: string;
    limit: number;
    creatorId?: string;
    hashtag?: string;
    excludeCreatorIds: string[];
  }): Promise<{ items: ReelDto[]; nextCursor: string | null }>;

  getReel(
    id: string,
    viewerId: string,
    excludeCreatorIds: string[],
  ): Promise<ReelDto | null>;

  toggleLike(
    id: string,
    viewerId: string,
  ): Promise<{
    liked: boolean;
    likesCount: number;
    reel: ReelVideoRecord;
  } | null>;

  listComments(
    id: string,
    params: { cursor?: string; limit: number; excludeAuthorIds: string[] },
  ): Promise<{
    items: CommentDto[];
    nextCursor: string | null;
    commentsCount: number;
  } | null>;

  addComment(
    id: string,
    viewerId: string,
    text: string,
  ): Promise<{ comment: CommentDto; commentsCount: number } | null>;

  recordShare(
    id: string,
    viewerId: string,
  ): Promise<{ sharesCount: number } | null>;

  getProfile(
    userId: string,
    viewerId: string,
    excludeCreatorIds: string[],
  ): Promise<CreatorProfileDto | null>;

  toggleFollow(
    userId: string,
    viewerId: string,
  ): Promise<{ following: boolean; followersCount: number } | 'self' | null>;

  /** FR-048: dedup per (userId, videoId); only a real insert increments viewsCount. */
  recordView(
    id: string,
    viewerId: string,
  ): Promise<{ viewsCount: number } | null>;

  /** FR-049: private toggle, no public counter. */
  toggleSave(id: string, viewerId: string): Promise<{ saved: boolean } | null>;

  /** FR-051: caller-scoped, newest-liked-first. */
  listLiked(
    viewerId: string,
    params: { cursor?: string; limit: number; excludeCreatorIds: string[] },
  ): Promise<{ items: ReelDto[]; nextCursor: string | null }>;

  /** FR-050: caller-scoped, newest-saved-first. */
  listSaved(
    viewerId: string,
    params: { cursor?: string; limit: number; excludeCreatorIds: string[] },
  ): Promise<{ items: ReelDto[]; nextCursor: string | null }>;

  /** FR-057: reels whose hashtags contain `q` (case-insensitive substring). */
  searchReels(params: {
    viewerId: string;
    q: string;
    cursor?: string;
    limit: number;
    excludeCreatorIds: string[];
  }): Promise<{ items: ReelDto[]; nextCursor: string | null }>;

  /** FR-057: users whose username/name contain `q`, excluding the caller + block set. */
  searchUsers(params: {
    viewerId: string;
    q: string;
    cursor?: string;
    limit: number;
    excludeUserIds: string[];
  }): Promise<{ items: UserSearchResultDto[]; nextCursor: string | null }>;
}
