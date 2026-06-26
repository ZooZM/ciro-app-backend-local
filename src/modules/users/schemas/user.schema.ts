import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

export enum SubscriptionTier {
  FREE = 'FREE',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Schema({ _id: false })
export class Subscription {
  @Prop({
    type: String,
    enum: SubscriptionTier,
    default: SubscriptionTier.FREE,
  })
  tier: string;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: string;

  // Authoritative remaining translation balance, stored in SECONDS to match
  // per-second billing (FR-026). Purchase/top-up flows MUST convert package
  // minutes → seconds (×60) at the purchase boundary before writing here.
  @Prop({ type: Number, default: 0 })
  translationSecondsBalance: number;

  @Prop({ type: Date, required: false })
  expiresAt?: Date;

  @Prop({ type: String, required: false })
  paymentCustomerId?: string;
}

@Schema({ _id: false })
export class Location {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  type: string;

  @Prop({ type: [Number], required: false })
  coordinates: number[]; // [longitude, latitude]
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, index: true })
  phoneNumber: string;

  @Prop({ required: false }) // fallback
  email?: string;

  @Prop({ required: false }) // fallback
  password?: string;

  @Prop({ default: false })
  isPhoneVerified: boolean;

  @Prop({ required: false })
  fcmToken?: string;

  @Prop({ required: false })
  refreshToken?: string;

  @Prop({ default: false })
  isOnline: boolean;

  @Prop({ type: Location, index: '2dsphere', required: false })
  location?: Location;

  // 018-snap-map-realtime: server-assigned write timestamp for `location`.
  // Drives idempotent ordering (FR-022a) and "nearby" staleness (24h, R5).
  @Prop({ type: Date, required: false })
  locationUpdatedAt?: Date;

  // 018-snap-map-realtime: global Ghost Mode (FR-011). When true, this user
  // is excluded from all map authorization results and fan-out.
  @Prop({ default: false })
  isGhostMode: boolean;

  // 018-snap-map-realtime: distinct from `location` existing at all — a user
  // who shared once and then explicitly stopped still has `location` set
  // (last known position) but must not reappear in Following-tab queries
  // until they start sharing again.
  @Prop({ default: false })
  isSharingLocation: boolean;

  @Prop({ type: Subscription, default: () => ({}) })
  subscription: Subscription;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  blockedUsers: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  syncedContacts: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  defaultStatusAudience: Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ syncedContacts: 1 });
