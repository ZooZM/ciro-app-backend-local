import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DeviceTokenDocument = DeviceToken & Document;

/**
 * `fcm` = Android FCM token; `apns` = FCM token from an iPhone (research F8);
 * `apns-watch` = raw APNs token from the watch app, used only for background
 * refresh pushes (026, research R9).
 */
export const DEVICE_PLATFORMS = ['fcm', 'apns', 'apns-watch'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];
export const PUSH_LOCALES = ['ar', 'en'] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

@Schema({ timestamps: true })
export class DeviceToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  token: string;

  @Prop({ type: String, required: true, enum: DEVICE_PLATFORMS })
  platform: DevicePlatform;

  /** 026 (research R12): language the server renders notification text in. */
  @Prop({ type: String, enum: PUSH_LOCALES, default: 'ar' })
  locale: PushLocale;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);

DeviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
