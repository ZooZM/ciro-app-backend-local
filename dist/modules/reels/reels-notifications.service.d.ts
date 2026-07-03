import { Model } from 'mongoose';
import { PushService } from '../notifications/push.service';
import { DeviceTokensRepository } from '../notifications/device-tokens.repository';
import { UserDocument } from '../users/schemas/user.schema';
import { NotificationEventDocument } from './schemas/notification-event.schema';
export declare class ReelsNotificationsService {
    private readonly eventModel;
    private readonly userModel;
    private readonly pushService;
    private readonly deviceTokens;
    private readonly logger;
    constructor(eventModel: Model<NotificationEventDocument>, userModel: Model<UserDocument>, pushService: PushService, deviceTokens: DeviceTokensRepository);
    notifyNewFollower(params: {
        actorId: string;
        recipientId: string;
    }): Promise<void>;
    notifyReelLike(params: {
        actorId: string;
        recipientId: string;
        reelId: string;
    }): Promise<void>;
    notifyMentions(params: {
        actorId: string;
        reelId: string;
        mentions: {
            userId: string;
            username: string;
        }[];
    }): Promise<void>;
    notifyReelRejected(params: {
        recipientId: string;
        reelId: string;
    }): Promise<void>;
    private recordEvent;
    private push;
}
