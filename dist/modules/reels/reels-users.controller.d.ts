import { ReelsService } from './reels.service';
import { SearchQueryDto } from './dto/search-query.dto';
export declare class ReelsUsersController {
    private readonly reelsService;
    constructor(reelsService: ReelsService);
    searchUsers(req: any, query: SearchQueryDto): Promise<{
        items: import("./reels.repository").UserSearchResultDto[];
        nextCursor: string | null;
    }>;
    getProfile(req: any, id: string): Promise<import("./reels.repository").CreatorProfileDto>;
    toggleFollow(req: any, id: string): Promise<{
        following: boolean;
        followersCount: number;
    }>;
    toggleBlock(req: any, id: string): Promise<{
        blocked: boolean;
    }>;
}
