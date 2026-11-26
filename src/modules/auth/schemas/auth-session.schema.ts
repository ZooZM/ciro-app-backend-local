import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionRevokedReason = 'replaced' | 'logout' | 'unlinked';

/**
 * 026 data-model §1.10: a per-device session for the Apple Watch (research R8).
 * The backend keeps one rotating refresh token per user, so a watch that
 * refreshed with the phone's token would log the phone out. The watch gets its
 * own session instead, rotated independently with the same revocation messages.
 */
@Schema({
  collection: 'auth_sessions',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuthSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['watch'] })
  deviceType: 'watch';

  /** SHA-256 of the current refresh token. */
  @Prop({ type: String, required: true })
  refreshTokenHash: string;

  @Prop({
    type: String,
    required: true,
    enum: ['active', 'revoked'],
    default: 'active',
  })
  status: 'active' | 'revoked';

  @Prop({ type: String, enum: ['replaced', 'logout', 'unlinked'] })
  revokedReason?: SessionRevokedReason;

  @Prop({ type: Date })
  lastRefreshedAt?: Date;

  @Prop({ type: Date })
  revokedAt?: Date;

  createdAt?: Date;
}

export type AuthSessionDocument = HydratedDocument<AuthSession>;
export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);

AuthSessionSchema.index(
  { userId: 1, deviceType: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
