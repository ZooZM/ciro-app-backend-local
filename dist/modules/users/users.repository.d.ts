import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../common/repositories/base.repository';
import { User, UserDocument } from './schemas/user.schema';
import { StatusDocument } from '../status/schemas/status.schema';
export declare class UsersRepository extends BaseRepository<UserDocument> {
    private readonly userModel;
    private readonly statusModel;
    constructor(userModel: Model<UserDocument>, statusModel: Model<StatusDocument>);
    findById(id: string): Promise<UserDocument | null>;
    findByPhoneNumber(phoneNumber: string): Promise<UserDocument | null>;
    findByPhoneNumbers(phoneNumbers: string[]): Promise<Partial<UserDocument>[]>;
    getTranslationBalanceSeconds(userId: string): Promise<number>;
    getTranslationSubscriptionInfo(userId: string): Promise<{
        translationSecondsBalance: number;
        tier: string;
        status: string;
    }>;
    decrementTranslationBalance(userId: string, seconds: number): Promise<number>;
    findManyByIds(ids: string[]): Promise<(User & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    findMutualContactIds(userId: string): Promise<Types.ObjectId[]>;
    getNearbyUsers(userId: string, lng: number, lat: number, maxDistanceKm: number, allowedUserIds: string[]): Promise<(User & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[] | {
        hasActiveStatus: boolean;
        name: string;
        phoneNumber: string;
        avatarUrl: string;
        username?: string;
        bio: string;
        followersCount: number;
        followingCount: number;
        totalLikes: number;
        email?: string;
        password?: string;
        isPhoneVerified: boolean;
        fcmToken?: string;
        refreshToken?: string;
        isOnline: boolean;
        location?: import("./schemas/user.schema").Location;
        locationUpdatedAt?: Date;
        isGhostMode: boolean;
        isSharingLocation: boolean;
        subscription: import("./schemas/user.schema").Subscription;
        blockedUsers: Types.ObjectId[];
        syncedContacts: string[];
        defaultStatusAudience: Types.ObjectId[];
        _id: Types.ObjectId;
        $locals: Record<string, unknown>;
        $op: "save" | "validate" | "remove" | null;
        $where: Record<string, unknown>;
        baseModelName?: string;
        collection: import("mongoose").Collection;
        db: import("mongoose").Connection;
        errors?: import("mongoose").Error.ValidationError;
        isNew: boolean;
        schema: import("mongoose").Schema;
        __v: number;
    }[]>;
}
