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

  // Pre-existing gap found while wiring 021-reels-video-feed (v2): every
  // `.select()` projection in users.repository.ts already asked for
  // `avatarUrl`, but no such field was ever declared on the schema, so it
  // was silently dropped from every read (Mongoose ignores undeclared
  // fields in strict mode). Declaring it here is what makes those existing
  // projections — and FR-044/FR-046's avatar binding — actually work.
  @Prop({ default: '' })
  avatarUrl: string;

  // 021-reels-video-feed (v2): Reels profile fields on the shared user
  // identity (clarified — one identity for chat + Reels, not a separate
  // profile entity). `unique: true` + `sparse: true` lets pre-existing users
  // remain usernameless until backfilled by the reels seed/migration.
  @Prop({ required: false, unique: true, sparse: true, lowercase: true })
  username?: string;

  @Prop({ default: '' })
  bio: string;

  // Stored counters (FR-055) — never computed by scanning relations at read
  // time. Kept in sync with `$inc` alongside the relation write that causes
  // the change (see ReelsDbRepository).
  @Prop({ default: 0 })
  followersCount: number;

  @Prop({ default: 0 })
  followingCount: number;

  @Prop({ default: 0 })
  totalLikes: number;

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
// 021-reels-video-feed (v2): reverse-block lookup (FR-052/053) — "who has
// blocked me" is `{ blockedUsers: myId }`, serviced by this multikey index.
UserSchema.index({ blockedUsers: 1 });
// User search by name (FR-057/FR-058, endpoint 18).
UserSchema.index({ name: 1 });
