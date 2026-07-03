import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { ReelDocument } from './schemas/reel.schema';
import { ReelLikeDocument } from './schemas/reel-like.schema';
import { ReelShareDocument } from './schemas/reel-share.schema';
import { ReelCommentDocument } from './schemas/reel-comment.schema';
import { FollowDocument } from './schemas/follow.schema';
export declare class ReelsSeedService implements OnModuleInit {
    private readonly userModel;
    private readonly reelModel;
    private readonly likeModel;
    private readonly shareModel;
    private readonly commentModel;
    private readonly followModel;
    private readonly logger;
    constructor(userModel: Model<UserDocument>, reelModel: Model<ReelDocument>, likeModel: Model<ReelLikeDocument>, shareModel: Model<ReelShareDocument>, commentModel: Model<ReelCommentDocument>, followModel: Model<FollowDocument>);
    onModuleInit(): Promise<void>;
    private backfillStatus;
    private backfillUsernames;
    private seed;
}
