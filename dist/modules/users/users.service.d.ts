import { User, UserDocument } from './schemas/user.schema';
import { UsersRepository } from './users.repository';
export declare class UsersService {
    private readonly usersRepository;
    constructor(usersRepository: UsersRepository);
    create(createData: Partial<User>): Promise<UserDocument>;
    findByPhoneNumber(phoneNumber: string): Promise<UserDocument | null>;
    findByEmail(email: string): Promise<UserDocument | null>;
    findById(id: string): Promise<UserDocument | null>;
    updateRefreshToken(id: string, refreshToken: string | null): Promise<void>;
    updateLocation(userId: string, lng: number, lat: number): Promise<Date>;
    setSharingLocation(userId: string, enabled: boolean): Promise<void>;
    getNearbyUsers(userId: string, lng: number, lat: number, maxDistanceKm: number, allowedUserIds: string[]): Promise<(User & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
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
        blockedUsers: import("mongoose").Types.ObjectId[];
        syncedContacts: string[];
        defaultStatusAudience: import("mongoose").Types.ObjectId[];
        _id: import("mongoose").Types.ObjectId;
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
    setGhostMode(userId: string, enabled: boolean): Promise<void>;
    isGhostMode(userId: string): Promise<boolean>;
    getBlockedUserIds(userId: string): Promise<string[]>;
    findManyByIds(ids: string[]): Promise<(User & import("mongoose").Document<import("mongoose").Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: import("mongoose").Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    syncContacts(userId: string, phoneNumbers: string[]): Promise<Partial<UserDocument>[]>;
    findMutualContactIds(userId: string): Promise<import("mongoose").Types.ObjectId[]>;
    updateOnlineStatus(userId: string, isOnline: boolean): Promise<void>;
}
