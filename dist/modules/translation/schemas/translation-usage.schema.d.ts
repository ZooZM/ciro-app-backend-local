import { Document, Types } from 'mongoose';
export declare enum TranslationUsageEndReason {
    USER_UNSUBSCRIBED = "user_unsubscribed",
    CREDITS_EXHAUSTED = "credits_exhausted",
    LEFT_CALL = "left_call",
    SERVICE_ERROR = "service_error",
    PIPELINE_TORN_DOWN = "pipeline_torn_down"
}
export type TranslationUsageDocument = TranslationUsage & Document;
export declare class TranslationUsage {
    listenerId: Types.ObjectId;
    roomId: string;
    speakerId: string;
    targetLanguage: string;
    detectedSourceLanguages: string[];
    secondsConsumed: number;
    interimCount: number;
    finalCount: number;
    endReason?: TranslationUsageEndReason;
    startedAt: Date;
    endedAt?: Date;
}
export declare const TranslationUsageSchema: import("mongoose").Schema<TranslationUsage, import("mongoose").Model<TranslationUsage, any, any, any, any, any, TranslationUsage>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, TranslationUsage, Document<unknown, {}, TranslationUsage, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    listenerId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    roomId?: import("mongoose").SchemaDefinitionProperty<string, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    speakerId?: import("mongoose").SchemaDefinitionProperty<string, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    targetLanguage?: import("mongoose").SchemaDefinitionProperty<string, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    detectedSourceLanguages?: import("mongoose").SchemaDefinitionProperty<string[], TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    secondsConsumed?: import("mongoose").SchemaDefinitionProperty<number, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    interimCount?: import("mongoose").SchemaDefinitionProperty<number, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    finalCount?: import("mongoose").SchemaDefinitionProperty<number, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    endReason?: import("mongoose").SchemaDefinitionProperty<TranslationUsageEndReason | undefined, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    startedAt?: import("mongoose").SchemaDefinitionProperty<Date, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    endedAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, TranslationUsage, Document<unknown, {}, TranslationUsage, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<TranslationUsage & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, TranslationUsage>;
