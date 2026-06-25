import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StatusDocument = Status & Document;

export enum StatusContentType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  VOICE = 'voice',
}

export enum StatusPrivacy {
  PUBLIC = 'public',
  PRIVATE = 'private',
  SHOW_ON_MAP = 'showOnMap',
}

@Schema({ _id: false })
export class StatusView {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  viewedAt: Date;
}
export const StatusViewSchema = SchemaFactory.createForClass(StatusView);

@Schema({ _id: false })
export class StatusReaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  reaction: string;

  @Prop({ type: Date, required: true })
  createdAt: Date;
}
export const StatusReactionSchema =
  SchemaFactory.createForClass(StatusReaction);

@Schema({ timestamps: true })
export class Status {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ type: String, required: true })
  clientStatusId: string;

  @Prop({
    type: String,
    enum: Object.values(StatusContentType),
    required: true,
  })
  contentType: StatusContentType;

  @Prop({ type: String, required: false })
  textContent?: string;

  @Prop({ type: String, required: false })
  mediaUrl?: string;

  @Prop({ type: String, required: false })
  mimeType?: string;

  @Prop({ type: String, required: false })
  backgroundColor?: string;

  @Prop({ type: String, required: false })
  fontStyle?: string;

  @Prop({ type: String, required: false })
  musicTrackId?: string;

  @Prop({ type: String, required: false })
  caption?: string;

  @Prop({
    type: String,
    enum: Object.values(StatusPrivacy),
    default: StatusPrivacy.PUBLIC,
  })
  privacy: StatusPrivacy;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  audience: Types.ObjectId[];

  @Prop({ type: [StatusViewSchema], default: [] })
  views: StatusView[];

  @Prop({ type: [StatusReactionSchema], default: [] })
  reactions: StatusReaction[];

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const StatusSchema = SchemaFactory.createForClass(Status);

StatusSchema.index({ clientStatusId: 1 }, { unique: true });
StatusSchema.index({ authorId: 1, createdAt: -1 });
StatusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StatusSchema.index({ privacy: 1, authorId: 1 });
