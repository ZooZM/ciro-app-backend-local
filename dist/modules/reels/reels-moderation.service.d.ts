import { Model } from 'mongoose';
import { ReelDocument } from './schemas/reel.schema';
import { UserDocument } from '../users/schemas/user.schema';
import type { ModerationProvider } from './moderation/moderation-provider';
import { ReelsNotificationsService } from './reels-notifications.service';
export declare class ReelsModerationService {
    private readonly reelModel;
    private readonly userModel;
    private readonly provider;
    private readonly notifications;
    private readonly logger;
    constructor(reelModel: Model<ReelDocument>, userModel: Model<UserDocument>, provider: ModerationProvider, notifications: ReelsNotificationsService);
    moderateReel(reelId: string): Promise<void>;
    findStalePendingIds(staleMs: number): Promise<string[]>;
    private toLocalPath;
    private publish;
    private blockFilteredMentions;
    private reject;
}
