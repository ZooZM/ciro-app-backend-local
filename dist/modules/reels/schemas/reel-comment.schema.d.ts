import { Document, Types } from 'mongoose';
export type ReelCommentDocument = ReelComment & Document;
export declare class ReelComment {
    videoId: Types.ObjectId;
    authorId: Types.ObjectId;
    text: string;
    createdAt?: Date;
}
export declare const ReelCommentSchema: import("mongoose").Schema<ReelComment, import("mongoose").Model<ReelComment, any, any, any, any, any, ReelComment>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReelComment, Document<unknown, {}, ReelComment, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReelComment & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    videoId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelComment, Document<unknown, {}, ReelComment, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelComment & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    authorId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelComment, Document<unknown, {}, ReelComment, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelComment & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    text?: import("mongoose").SchemaDefinitionProperty<string, ReelComment, Document<unknown, {}, ReelComment, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelComment & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, ReelComment, Document<unknown, {}, ReelComment, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelComment & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ReelComment>;
