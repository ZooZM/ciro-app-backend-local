import { ReelsService } from './reels.service';
export declare class ReelsUsersController {
    private readonly reelsService;
    constructor(reelsService: ReelsService);
    getProfile(req: any, id: string): Promise<import("./reels.repository").CreatorProfileDto>;
    toggleFollow(req: any, id: string): Promise<{
        following: boolean;
        followersCount: number;
    }>;
}
