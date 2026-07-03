import { Document, Types } from 'mongoose';
export type ReelViewDocument = ReelView & Document;
export declare class ReelView {
    userId: Types.ObjectId;
    videoId: Types.ObjectId;
    createdAt?: Date;
}
export declare const ReelViewSchema: import("mongoose").Schema<ReelView, import("mongoose").Model<ReelView, any, any, any, any, any, ReelView>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReelView, Document<unknown, {}, ReelView, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReelView & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelView, Document<unknown, {}, ReelView, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelView & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    videoId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelView, Document<unknown, {}, ReelView, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelView & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, ReelView, Document<unknown, {}, ReelView, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelView & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ReelView>;
