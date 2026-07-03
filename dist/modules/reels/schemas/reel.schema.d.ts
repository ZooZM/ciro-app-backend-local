import { Document, Types } from 'mongoose';
export type ReelDocument = Reel & Document;
export declare class ReelMention {
    userId: Types.ObjectId;
    username: string;
}
export declare const ReelMentionSchema: import("mongoose").Schema<ReelMention, import("mongoose").Model<ReelMention, any, any, any, any, any, ReelMention>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReelMention, Document<unknown, {}, ReelMention, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReelMention & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, ReelMention, Document<unknown, {}, ReelMention, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelMention & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    username?: import("mongoose").SchemaDefinitionProperty<string, ReelMention, Document<unknown, {}, ReelMention, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReelMention & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ReelMention>;
export declare enum ReelStatus {
    PENDING_MODERATION = "pending_moderation",
    PUBLISHED = "published",
    REJECTED = "rejected"
}
export declare class ModerationResult {
    verdict: 'clean' | 'flagged';
    flaggedSource?: 'video' | 'description';
    categories: string[];
    providerRef?: string;
    completedAt: Date;
}
export declare const ModerationResultSchema: import("mongoose").Schema<ModerationResult, import("mongoose").Model<ModerationResult, any, any, any, any, any, ModerationResult>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ModerationResult, Document<unknown, {}, ModerationResult, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ModerationResult & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    verdict?: import("mongoose").SchemaDefinitionProperty<"clean" | "flagged", ModerationResult, Document<unknown, {}, ModerationResult, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ModerationResult & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    flaggedSource?: import("mongoose").SchemaDefinitionProperty<"video" | "description" | undefined, ModerationResult, Document<unknown, {}, ModerationResult, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ModerationResult & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    categories?: import("mongoose").SchemaDefinitionProperty<string[], ModerationResult, Document<unknown, {}, ModerationResult, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ModerationResult & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    providerRef?: import("mongoose").SchemaDefinitionProperty<string | undefined, ModerationResult, Document<unknown, {}, ModerationResult, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ModerationResult & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    completedAt?: import("mongoose").SchemaDefinitionProperty<Date, ModerationResult, Document<unknown, {}, ModerationResult, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ModerationResult & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, ModerationResult>;
export declare class Reel {
    creatorId: Types.ObjectId;
    videoUrl: string;
    thumbnailUrl: string;
    description: string;
    hashtags: string[];
    mentions: ReelMention[];
    status: ReelStatus;
    publishedAt?: Date;
    moderation?: ModerationResult;
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    createdAt?: Date;
    updatedAt?: Date;
}
export declare const ReelSchema: import("mongoose").Schema<Reel, import("mongoose").Model<Reel, any, any, any, any, any, Reel>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Reel, Document<unknown, {}, Reel, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    creatorId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    videoUrl?: import("mongoose").SchemaDefinitionProperty<string, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    thumbnailUrl?: import("mongoose").SchemaDefinitionProperty<string, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    description?: import("mongoose").SchemaDefinitionProperty<string, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    hashtags?: import("mongoose").SchemaDefinitionProperty<string[], Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    mentions?: import("mongoose").SchemaDefinitionProperty<ReelMention[], Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<ReelStatus, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    publishedAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    moderation?: import("mongoose").SchemaDefinitionProperty<ModerationResult | undefined, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    viewsCount?: import("mongoose").SchemaDefinitionProperty<number, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    likesCount?: import("mongoose").SchemaDefinitionProperty<number, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    commentsCount?: import("mongoose").SchemaDefinitionProperty<number, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    sharesCount?: import("mongoose").SchemaDefinitionProperty<number, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    updatedAt?: import("mongoose").SchemaDefinitionProperty<Date | undefined, Reel, Document<unknown, {}, Reel, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Reel & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Reel>;
