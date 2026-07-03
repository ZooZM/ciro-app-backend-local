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
    stats: {
        followers: number;
        following: number;
        totalLikes: number;
    };
    videos: {
        id: string;
        thumbnailUrl: string;
    }[];
    viewer: {
        following: boolean;
        isSelf: boolean;
    };
}
export interface UserSearchResultDto {
    id: string;
    username: string;
    name: string;
    avatarUrl: string;
    viewerFollowing: boolean;
}
export declare const REELS_REPOSITORY: unique symbol;
export interface ReelsRepository {
    listFeed(params: {
        viewerId: string;
        cursor?: string;
        limit: number;
        creatorId?: string;
        hashtag?: string;
        excludeCreatorIds: string[];
    }): Promise<{
        items: ReelDto[];
        nextCursor: string | null;
    }>;
    getReel(id: string, viewerId: string, excludeCreatorIds: string[]): Promise<ReelDto | null>;
    toggleLike(id: string, viewerId: string): Promise<{
        liked: boolean;
        likesCount: number;
        reel: ReelVideoRecord;
    } | null>;
    listComments(id: string, params: {
        cursor?: string;
        limit: number;
        excludeAuthorIds: string[];
    }): Promise<{
        items: CommentDto[];
        nextCursor: string | null;
        commentsCount: number;
    } | null>;
    addComment(id: string, viewerId: string, text: string): Promise<{
        comment: CommentDto;
        commentsCount: number;
    } | null>;
    recordShare(id: string, viewerId: string): Promise<{
        sharesCount: number;
    } | null>;
    getProfile(userId: string, viewerId: string, excludeCreatorIds: string[]): Promise<CreatorProfileDto | null>;
    toggleFollow(userId: string, viewerId: string): Promise<{
        following: boolean;
        followersCount: number;
    } | 'self' | null>;
    recordView(id: string, viewerId: string): Promise<{
        viewsCount: number;
    } | null>;
    toggleSave(id: string, viewerId: string): Promise<{
        saved: boolean;
    } | null>;
    listLiked(viewerId: string, params: {
        cursor?: string;
        limit: number;
        excludeCreatorIds: string[];
    }): Promise<{
        items: ReelDto[];
        nextCursor: string | null;
    }>;
    listSaved(viewerId: string, params: {
        cursor?: string;
        limit: number;
        excludeCreatorIds: string[];
    }): Promise<{
        items: ReelDto[];
        nextCursor: string | null;
    }>;
    searchReels(params: {
        viewerId: string;
        q: string;
        cursor?: string;
        limit: number;
        excludeCreatorIds: string[];
    }): Promise<{
        items: ReelDto[];
        nextCursor: string | null;
    }>;
    searchUsers(params: {
        viewerId: string;
        q: string;
        cursor?: string;
        limit: number;
        excludeUserIds: string[];
    }): Promise<{
        items: UserSearchResultDto[];
        nextCursor: string | null;
    }>;
}
