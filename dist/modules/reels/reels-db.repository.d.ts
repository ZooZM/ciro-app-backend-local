import { Model } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { ReelDocument } from './schemas/reel.schema';
import { NotificationEventDocument } from './schemas/notification-event.schema';
import { ReelLikeDocument } from './schemas/reel-like.schema';
import { ReelSaveDocument } from './schemas/reel-save.schema';
import { ReelViewDocument } from './schemas/reel-view.schema';
import { ReelShareDocument } from './schemas/reel-share.schema';
import { ReelCommentDocument } from './schemas/reel-comment.schema';
import { FollowDocument } from './schemas/follow.schema';
import { CommentDto, CreatorProfileDto, ReelDto, ReelsRepository, ReelVideoRecord, UserSearchResultDto } from './reels.repository';
export declare class ReelsDbRepository implements ReelsRepository {
    private readonly reelModel;
    private readonly likeModel;
    private readonly saveModel;
    private readonly viewModel;
    private readonly shareModel;
    private readonly commentModel;
    private readonly followModel;
    private readonly userModel;
    private readonly notificationEventModel;
    constructor(reelModel: Model<ReelDocument>, likeModel: Model<ReelLikeDocument>, saveModel: Model<ReelSaveDocument>, viewModel: Model<ReelViewDocument>, shareModel: Model<ReelShareDocument>, commentModel: Model<ReelCommentDocument>, followModel: Model<FollowDocument>, userModel: Model<UserDocument>, notificationEventModel: Model<NotificationEventDocument>);
    private toObjectId;
    private parseCursor;
    private hydrate;
    private toRecord;
    private excludeFilter;
    private visibilityFilter;
    createReel(params: {
        creatorId: string;
        videoUrl: string;
        thumbnailUrl: string;
        description: string;
        hashtags: string[];
        mentions: {
            userId: string;
            username: string;
        }[];
    }): Promise<ReelDto>;
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
    private listByRelation;
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
    deleteReel(id: string, viewerId: string): Promise<{
        deleted: true;
        videoUrl: string;
        thumbnailUrl: string;
    } | 'forbidden' | null>;
    private unlinkIfLocal;
}
