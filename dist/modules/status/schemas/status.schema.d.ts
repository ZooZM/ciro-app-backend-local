import { Document, Types } from 'mongoose';
export type StatusDocument = Status & Document;
export declare enum StatusContentType {
    TEXT = "text",
    IMAGE = "image",
    VIDEO = "video",
    VOICE = "voice"
}
export declare enum StatusPrivacy {
    PUBLIC = "public",
    PRIVATE = "private",
    SHOW_ON_MAP = "showOnMap"
}
export declare class StatusView {
    userId: Types.ObjectId;
    viewedAt: Date;
}
export declare const StatusViewSchema: import("mongoose").Schema<StatusView, import("mongoose").Model<StatusView, any, any, any, any, any, StatusView>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, StatusView, Document<unknown, {}, StatusView, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<StatusView & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, StatusView, Document<unknown, {}, StatusView, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusView & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    viewedAt?: import("mongoose").SchemaDefinitionProperty<Date, StatusView, Document<unknown, {}, StatusView, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusView & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, StatusView>;
export declare class StatusReaction {
    userId: Types.ObjectId;
    reaction: string;
    createdAt: Date;
}
export declare const StatusReactionSchema: import("mongoose").Schema<StatusReaction, import("mongoose").Model<StatusReaction, any, any, any, any, any, StatusReaction>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, StatusReaction, Document<unknown, {}, StatusReaction, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<StatusReaction & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    userId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, StatusReaction, Document<unknown, {}, StatusReaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusReaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reaction?: import("mongoose").SchemaDefinitionProperty<string, StatusReaction, Document<unknown, {}, StatusReaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusReaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, StatusReaction, Document<unknown, {}, StatusReaction, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusReaction & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, StatusReaction>;
export declare class Status {
    authorId: Types.ObjectId;
    clientStatusId: string;
    contentType: StatusContentType;
    textContent?: string;
    mediaUrl?: string;
    mimeType?: string;
    backgroundColor?: string;
    fontStyle?: string;
    musicTrackId?: string;
    caption?: string;
    privacy: StatusPrivacy;
    audience: Types.ObjectId[];
    views: StatusView[];
    reactions: StatusReaction[];
    expiresAt: Date;
}
export declare const StatusSchema: import("mongoose").Schema<Status, import("mongoose").Model<Status, any, any, any, any, any, Status>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Status, Document<unknown, {}, Status, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    authorId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    clientStatusId?: import("mongoose").SchemaDefinitionProperty<string, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    contentType?: import("mongoose").SchemaDefinitionProperty<StatusContentType, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    textContent?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    mediaUrl?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    mimeType?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    backgroundColor?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    fontStyle?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    musicTrackId?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    caption?: import("mongoose").SchemaDefinitionProperty<string | undefined, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    privacy?: import("mongoose").SchemaDefinitionProperty<StatusPrivacy, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    audience?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId[], Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    views?: import("mongoose").SchemaDefinitionProperty<StatusView[], Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    reactions?: import("mongoose").SchemaDefinitionProperty<StatusReaction[], Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    expiresAt?: import("mongoose").SchemaDefinitionProperty<Date, Status, Document<unknown, {}, Status, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Status & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Status>;
