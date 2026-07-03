import { Document, Types } from 'mongoose';
export declare enum MessageType {
    TEXT = "text",
    IMAGE = "image",
    FILE = "file",
    CONTACT = "contact",
    VOICE_NOTE = "voice_note",
    SYSTEM = "system",
    LOCATION = "location",
    AUDIO = "audio",
    POLL = "poll",
    EVENT = "event",
    VIDEO = "video",
    REEL_SHARE = "reel_share"
}
export declare enum MessageStatus {
    PENDING = "pending",
    SENT = "sent",
    DELIVERED = "delivered",
    READ = "read"
}
export declare class MessageMetadata {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    question?: string;
    options?: string[];
    votes?: Record<string, string[]>;
    title?: string;
    dateTime?: string;
    description?: string;
    thumbnailUrl?: string;
    reelId?: string;
    creatorName?: string;
    deepLink?: string;
}
export type MessageDocument = Message & Document;
export declare class StatusRef {
    statusId: Types.ObjectId;
    statusAuthorId: Types.ObjectId;
    expiresAt: Date;
}
export declare const StatusRefSchema: import("mongoose").Schema<StatusRef, import("mongoose").Model<StatusRef, any, any, any, any, any, StatusRef>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, StatusRef, Document<unknown, {}, StatusRef, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<StatusRef & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    statusId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, StatusRef, Document<unknown, {}, StatusRef, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusRef & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    statusAuthorId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, StatusRef, Document<unknown, {}, StatusRef, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusRef & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    expiresAt?: import("mongoose").SchemaDefinitionProperty<Date, StatusRef, Document<unknown, {}, StatusRef, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<StatusRef & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, StatusRef>;
export declare class Message {
    chatRoomId: Types.ObjectId;
    senderId: Types.ObjectId;
    content: string;
    clientMessageId: string;
    messageType: MessageType;
    fileUrl?: string;
    metadata?: MessageMetadata;
    status: MessageStatus;
    deliveredTo: string[];
    readBy: string[];
    isDeleted: boolean;
    waveformSamples: number[];
    statusRef?: StatusRef;
}
export declare const MessageSchema: import("mongoose").Schema<Message, import("mongoose").Model<Message, any, any, any, any, any, Message>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Message, Document<unknown, {}, Message, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    chatRoomId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    senderId?: import("mongoose").SchemaDefinitionProperty<Types.ObjectId, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    content?: import("mongoose").SchemaDefinitionProperty<string, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    clientMessageId?: import("mongoose").SchemaDefinitionProperty<string, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    messageType?: import("mongoose").SchemaDefinitionProperty<MessageType, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    fileUrl?: import("mongoose").SchemaDefinitionProperty<string | undefined, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    metadata?: import("mongoose").SchemaDefinitionProperty<MessageMetadata | undefined, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    status?: import("mongoose").SchemaDefinitionProperty<MessageStatus, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    deliveredTo?: import("mongoose").SchemaDefinitionProperty<string[], Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    readBy?: import("mongoose").SchemaDefinitionProperty<string[], Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    isDeleted?: import("mongoose").SchemaDefinitionProperty<boolean, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    waveformSamples?: import("mongoose").SchemaDefinitionProperty<number[], Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
    statusRef?: import("mongoose").SchemaDefinitionProperty<StatusRef | undefined, Message, Document<unknown, {}, Message, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Message & {
        _id: Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }> | undefined;
}, Message>;
