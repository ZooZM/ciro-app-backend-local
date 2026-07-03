import { Model } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
export declare function parseHashtagsAndMentions(description: string, userModel: Model<UserDocument>): Promise<{
    hashtags: string[];
    mentions: {
        userId: string;
        username: string;
    }[];
}>;
