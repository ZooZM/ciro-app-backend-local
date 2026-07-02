import { CommentDto, CreatorProfileDto, ReelDto, ReelsRepository } from '../reels.repository';
export declare class ReelsMockStore implements ReelsRepository {
    private readonly users;
    private readonly videos;
    private readonly likes;
    private readonly comments;
    private readonly shares;
    private readonly follows;
    private readonly feedOrder;
    constructor();
    private findUser;
    private findVideo;
    private likesCount;
    private commentsCount;
    private sharesCount;
    private followersCount;
    private followingCount;
    private isFollowing;
    private hasLiked;
    private toReelDto;
    private toCommentDto;
    private parseCursor;
    listFeed(params: {
        viewerId: string;
        cursor?: string;
        limit: number;
        creatorId?: string;
    }): Promise<{
        items: ReelDto[];
        nextCursor: string | null;
    }>;
    getReel(id: string, viewerId: string): Promise<ReelDto | null>;
    toggleLike(id: string, viewerId: string): Promise<{
        liked: boolean;
        likesCount: number;
    } | null>;
    listComments(id: string, params: {
        cursor?: string;
        limit: number;
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
    getProfile(userId: string, viewerId: string): Promise<CreatorProfileDto | null>;
    toggleFollow(userId: string, viewerId: string): Promise<{
        following: boolean;
        followersCount: number;
    } | 'self' | null>;
}
