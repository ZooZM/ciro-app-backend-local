import { Document, Types } from 'mongoose';
export type ReelShareDocument = ReelShare & Document;
export declare class ReelShare {
    userId: Types.ObjectId;
    videoId: Types.ObjectId;
    createdAt?: Date;
}
export declare const ReelShareSchema: import("mongoose").Schema<ReelShare, import("mongoose").Model<ReelShare, any, any, any, any, any, ReelShare>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReelShare, Document<unknown, {}, ReelShare, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReelShare & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelShare, Document<unknown, {}, ReelShare, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelShare & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    videoId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelShare, Document<unknown, {}, ReelShare, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelShare & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, ReelShare, Document<unknown, {}, ReelShare, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelShare & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ReelShare>;
