import { Document, Types } from 'mongoose';
export type ReelLikeDocument = ReelLike & Document;
export declare class ReelLike {
    userId: Types.ObjectId;
    videoId: Types.ObjectId;
    createdAt?: Date;
}
export declare const ReelLikeSchema: import("mongoose").Schema<ReelLike, import("mongoose").Model<ReelLike, any, any, any, any, any, ReelLike>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReelLike, Document<unknown, {}, ReelLike, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReelLike & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelLike, Document<unknown, {}, ReelLike, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelLike & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    videoId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelLike, Document<unknown, {}, ReelLike, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelLike & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, ReelLike, Document<unknown, {}, ReelLike, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelLike & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ReelLike>;
