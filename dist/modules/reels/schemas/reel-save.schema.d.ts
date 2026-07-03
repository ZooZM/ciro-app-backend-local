import { Document, Types } from 'mongoose';
export type ReelSaveDocument = ReelSave & Document;
export declare class ReelSave {
    userId: Types.ObjectId;
    videoId: Types.ObjectId;
    createdAt?: Date;
}
export declare const ReelSaveSchema: import("mongoose").Schema<ReelSave, import("mongoose").Model<ReelSave, any, any, any, any, any, ReelSave>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReelSave, Document<unknown, {}, ReelSave, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReelSave & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelSave, Document<unknown, {}, ReelSave, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelSave & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    videoId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelSave, Document<unknown, {}, ReelSave, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelSave & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, ReelSave, Document<unknown, {}, ReelSave, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelSave & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ReelSave>;
