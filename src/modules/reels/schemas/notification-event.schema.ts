import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationEventDocument = NotificationEvent & Document;

export enum NotificationEventType {
  NEW_FOLLOWER = 'newFollower',
  REEL_LIKE = 'reelLike',
  REEL_MENTION = 'reelMention',
}

// FR-054: durable record of a notification-worthy action, written before the
// FCM push fan-out is attempted. `actorId != recipientId` is enforced in the
// service layer — a user's own actions on their own content never notify.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class NotificationEvent {
  @Prop({ type: String, enum: NotificationEventType, required: true })
  type: NotificationEventType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientId: Types.ObjectId;

  // Absent for `newFollower`; the liked/mentioned reel otherwise.
  @Prop({ type: Types.ObjectId, ref: 'Reel', required: false })
  reelId?: Types.ObjectId;

  createdAt?: Date;
}

export const NotificationEventSchema =
  SchemaFactory.createForClass(NotificationEvent);

// Future notification-center reads (out of scope this phase, index paid for now).
NotificationEventSchema.index({ recipientId: 1, createdAt: -1 });
// Dedup: re-like/re-follow after undo never re-notifies (R14) — reelId is
// part of the key so two different reels from the same actor both notify.
NotificationEventSchema.index(
  { type: 1, actorId: 1, recipientId: 1, reelId: 1 },
  { unique: true },
);
