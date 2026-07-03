import { Document, Types } from 'mongoose';
export type FollowDocument = Follow & Document;
export declare class Follow {
    followerId: Types.ObjectId;
    followeeId: Types.ObjectId;
    createdAt?: Date;
}
export declare const FollowSchema: import("mongoose").Schema<Follow, import("mongoose").Model<Follow, any, any, any, any, any, Follow>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Follow, Document<unknown, {}, Follow, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Follow & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    followerId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Follow, Document<unknown, {}, Follow, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Follow & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    followeeId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Follow, Document<unknown, {}, Follow, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Follow & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Follow, Document<unknown, {}, Follow, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Follow & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Follow>;
