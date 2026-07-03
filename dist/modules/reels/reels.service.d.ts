import { Model } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import type { ReelsRepository } from './reels.repository';
import { FeedQueryDto, CommentsQueryDto } from './dto/feed-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { ReelsNotificationsService } from './reels-notifications.service';
export declare class ReelsService {
    private readonly repository;
    private readonly userModel;
    private readonly notifications;
    constructor(repository: ReelsRepository, userModel: Model<UserDocument>, notifications: ReelsNotificationsService);
    private getBlockSet;
    getFeed(viewerId: string, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getReel(id: string, viewerId: string): Promise<import("./reels.repository").ReelDto>;
    toggleLike(id: string, viewerId: string): Promise<{
        liked: boolean;
        likesCount: number;
    }>;
    getComments(id: string, viewerId: string, query: CommentsQueryDto): Promise<{
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
    recordView(id: string, viewerId: string): Promise<{
        viewsCount: number;
    }>;
    toggleSave(id: string, viewerId: string): Promise<{
        saved: boolean;
    }>;
    getLiked(viewerId: string, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getSaved(viewerId: string, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    searchReels(viewerId: string, query: SearchQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    searchUsers(viewerId: string, query: SearchQueryDto): Promise<{
        items: import("./reels.repository").UserSearchResultDto[];
        nextCursor: string | null;
    }>;
    toggleBlock(targetId: string, viewerId: string): Promise<{
        blocked: boolean;
    }>;
}
