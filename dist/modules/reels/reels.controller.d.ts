import { ReelsService } from './reels.service';
import { CommentsQueryDto, FeedQueryDto } from './dto/feed-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
export declare class ReelsController {
    private readonly reelsService;
    constructor(reelsService: ReelsService);
    getFeed(req: any, query: FeedQueryDto): Promise<{
        items: import("./reels.repository").ReelDto[];
        nextCursor: string | null;
    }>;
    getReel(req: any, id: string): Promise<import("./reels.repository").ReelDto>;
    toggleLike(req: any, id: string): Promise<{
        liked: boolean;
        likesCount: number;
    }>;
    getComments(id: string, query: CommentsQueryDto): Promise<{
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
}
