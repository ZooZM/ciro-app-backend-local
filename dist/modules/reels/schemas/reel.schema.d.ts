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
export declare class Reel {
    creatorId: Types.ObjectId;
    videoUrl: string;
    thumbnailUrl: string;
    description: string;
    hashtags: string[];
    mentions: ReelMention[];
    viewsCount: number;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    createdAt?: Date;
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
}, Reel>;
