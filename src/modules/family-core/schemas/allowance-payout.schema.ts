import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PayoutStatus = 'paid' | 'failed' | 'paid_late';
export type PayoutFailureReason = 'INSUFFICIENT_FUNDS' | 'SERVICE_UNAVAILABLE';

/**
 * 026 data-model §1.7. One row per child per calendar month (FR-034).
 * `failed → paid_late` through "Pay now" until the next payout date (FR-032).
 */
@Schema({ collection: 'allowance_payouts', timestamps: true })
export class AllowancePayout {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parentUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FamilyLink', required: true })
  linkId: Types.ObjectId;

  /** `YYYY-MM`. */
  @Prop({ type: String, required: true })
  month: string;

  /** Riyadh date `effectivePayoutDate(month, payoutDay)`. */
  @Prop({ type: String, required: true })
  scheduledFor: string;

  @Prop({ type: Number, required: true })
  amountHalalas: number;

  @Prop({ type: String, required: true, enum: ['paid', 'failed', 'paid_late'] })
  status: PayoutStatus;

  @Prop({ type: String, enum: ['INSUFFICIENT_FUNDS', 'SERVICE_UNAVAILABLE'] })
  failureReason?: PayoutFailureReason;

  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry' })
  ledgerEntryId?: Types.ObjectId;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export type AllowancePayoutDocument = HydratedDocument<AllowancePayout>;
export const AllowancePayoutSchema =
  SchemaFactory.createForClass(AllowancePayout);

AllowancePayoutSchema.index({ childUserId: 1, month: 1 }, { unique: true });
AllowancePayoutSchema.index({ parentUserId: 1, status: 1 });
