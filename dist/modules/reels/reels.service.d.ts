import type { ReelsRepository } from './reels.repository';
import { FeedQueryDto, CommentsQueryDto } from './dto/feed-query.dto';
export declare class ReelsService {
    private readonly repository;
    constructor(repository: ReelsRepository);
    getFeed(viewerId: string, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getReel(id: string, viewerId: string): Promise<import("./reels.repository").ReelDto>;
    toggleLike(id: string, viewerId: string): Promise<{
        liked: boolean;
        likesCount: number;
    }>;
    getComments(id: string, query: CommentsQueryDto): Promise<{
        items: import("./reels.repository").CommentDto[];
        nextCursor: string | null;
        commentsCount: number;
    }>;
    addComment(id: string, viewerId: string, text: string): Promise<{
        comment: import("./reels.repository").CommentDto;
        commentsCount: number;
    }>;
    recordShare(id: string, viewerId: string): Promise<{
        sharesCount: number;
    }>;
    getProfile(userId: string, viewerId: string): Promise<import("./reels.repository").CreatorProfileDto>;
    toggleFollow(userId: string, viewerId: string): Promise<{
        following: boolean;
        followersCount: number;
    }>;
}
