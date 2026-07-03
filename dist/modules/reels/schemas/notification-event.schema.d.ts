import { Document, Types } from 'mongoose';
export type NotificationEventDocument = NotificationEvent & Document;
export declare enum NotificationEventType {
    NEW_FOLLOWER = "newFollower",
    REEL_LIKE = "reelLike",
    REEL_MENTION = "reelMention"
}
export declare class NotificationEvent {
    type: NotificationEventType;
    actorId: Types.ObjectId;
    recipientId: Types.ObjectId;
    reelId?: Types.ObjectId;
    createdAt?: Date;
}
export declare const NotificationEventSchema: import("mongoose").Schema<NotificationEvent, import("mongoose").Model<NotificationEvent, any, any, any, any, any, NotificationEvent>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, NotificationEvent, Document<unknown, {}, NotificationEvent, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<NotificationEvent & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    type?: import("mongoose").SchemaDefinitionProperty<NotificationEventType, NotificationEvent, Document<unknown, {}, NotificationEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<NotificationEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    actorId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, NotificationEvent, Document<unknown, {}, NotificationEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<NotificationEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    recipientId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, NotificationEvent, Document<unknown, {}, NotificationEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<NotificationEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reelId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId | undefined, NotificationEvent, Document<unknown, {}, NotificationEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<NotificationEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, NotificationEvent, Document<unknown, {}, NotificationEvent, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<NotificationEvent & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, NotificationEvent>;
