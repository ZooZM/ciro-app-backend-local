import { ReelCommentRecord, ReelCreatorRecord, ReelVideoRecord } from '../reels.repository';
export interface ReelsSeedData {
    users: ReelCreatorRecord[];
    videos: ReelVideoRecord[];
    likes: {
        userId: string;
        videoId: string;
    }[];
    comments: ReelCommentRecord[];
    shares: {
        userId: string;
        videoId: string;
        createdAt: string;
    }[];
    follows: {
        followerId: string;
        followeeId: string;
    }[];
}
export declare function buildReelsSeed(): ReelsSeedData;
