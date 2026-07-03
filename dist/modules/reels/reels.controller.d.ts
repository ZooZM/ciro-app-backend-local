import { ReelsService } from './reels.service';
import { CommentsQueryDto, FeedQueryDto } from './dto/feed-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SearchQueryDto } from './dto/search-query.dto';
export declare class ReelsController {
    private readonly reelsService;
    constructor(reelsService: ReelsService);
    getLiked(req: any, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getSaved(req: any, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    searchReels(req: any, query: SearchQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getFeed(req: any, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getReel(req: any, id: string): Promise<import("./reels.repository").ReelDto>;
    toggleLike(req: any, id: string): Promise<{
        liked: boolean;
        likesCount: number;
    }>;
    getComments(req: any, id: string, query: CommentsQueryDto): Promise<{
        items: import("./reels.repository").CommentDto[];
        nextCursor: string | null;
        commentsCount: number;
    }>;
    addComment(req: any, id: string, dto: CreateCommentDto): Promise<{
        comment: import("./reels.repository").CommentDto;
        commentsCount: number;
    }>;
    recordShare(req: any, id: string): Promise<{
        sharesCount: number;
    }>;
    recordView(req: any, id: string): Promise<{
        viewsCount: number;
    }>;
    toggleSave(req: any, id: string): Promise<{
        saved: boolean;
    }>;
}
