import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  CONTACT = 'contact',
  VOICE_NOTE = 'voice_note',
  SYSTEM = 'system',
  LOCATION = 'location',
  AUDIO = 'audio',
  POLL = 'poll',
  EVENT = 'event',
  VIDEO = 'video',
  /** 021-reels-video-feed: in-app reel share, rendered as a rich preview card (FR-021c). */
  REEL_SHARE = 'reel_share',
}

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

/**
 * Flexible metadata bag stored as a sub-document.
 *   Images / Files:  { fileName, fileSize, mimeType }
 *   Contacts:        { contactName, contactPhone, contactEmail? }
 *   Voice notes:     { duration } (seconds)
 *   Location:        { latitude, longitude, address? }
 *   Audio:           { duration, mimeType, fileName }
 *   Poll:            { question, options, votes? }
 *   Event:           { title, dateTime, description? }
 *   Reel share:      { reelId, thumbnailUrl, creatorName, deepLink } (021-reels-video-feed)
 */
export class MessageMetadata {
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

@Schema({ _id: false })
export class StatusRef {
  @Prop({ type: Types.ObjectId, ref: 'Status', required: true })
  statusId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  statusAuthorId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}
export const StatusRefSchema = SchemaFactory.createForClass(StatusRef);

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'ChatRoom', required: true, index: true })
  chatRoomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  /** Text body. Empty string is valid for pure file/image messages (no caption). */
  @Prop({ type: String, default: '' })
  content: string;

  @Prop({ type: String, required: false })
  clientMessageId: string;

  @Prop({
    type: String,
    enum: Object.values(MessageType),
    default: MessageType.TEXT,
  })
  messageType: MessageType;

  /** Relative URL returned by POST /chat/upload, e.g. /uploads/abc.jpg */
  @Prop({ type: String, required: false })
  fileUrl?: string;

  /** Flexible metadata: fileName/fileSize for files, contactName/phone for contacts, etc. */
  @Prop({ type: Object, required: false })
  metadata?: MessageMetadata;

  @Prop({
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.SENT,
  })
  status: MessageStatus;

  @Prop({ type: [String], default: [] })
  deliveredTo: string[];

  @Prop({ type: [String], default: [] })
  readBy: string[];

  /** FR-022: Soft-delete. When true the content is hidden from all clients. */
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  /** FR-027: Waveform samples pre-extracted at record time to avoid receiver re-extraction. */
  @Prop({ type: [Number], default: [] })
  waveformSamples: number[];

  /** Present only for messages created via a status reply (FR-012). */
  @Prop({ type: StatusRefSchema, required: false })
  statusRef?: StatusRef;
}
export const MessageSchema = SchemaFactory.createForClass(Message);

// Compound index for efficient room message pagination queries
MessageSchema.index({ chatRoomId: 1, _id: -1 });

// Cleans up status-reply messages in alignment with their source status's
// 24h expiry (research.md §2). Partial index: only documents with statusRef.
MessageSchema.index(
  { 'statusRef.expiresAt': 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { statusRef: { $exists: true } },
  },
);
