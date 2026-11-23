import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  REQUEST_REASONS,
  REQUEST_SOURCES,
  REQUEST_STATUSES,
} from '../family-core.constants';
import type {
  RequestReason,
  RequestSource,
  RequestStatus,
} from '../family-core.constants';

/**
 * 026 data-model §1.8 (FR-050–057). Every transition out of `pending` is a
 * `findOneAndUpdate({ _id, status: 'pending' })`, so exactly one writer wins.
 */
@Schema({ collection: 'allowance_requests', timestamps: true })
export class AllowanceRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parentUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FamilyLink', required: true })
  linkId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  amountHalalas: number;

  @Prop({ type: String, required: true, enum: REQUEST_REASONS })
  reason: RequestReason;

  @Prop({ type: String, required: true, enum: REQUEST_SOURCES })
  source: RequestSource;

  @Prop({
    type: String,
    required: true,
    enum: REQUEST_STATUSES,
    default: 'pending',
  })
  status: RequestStatus;

  @Prop({ type: Number })
  approvedAmountHalalas?: number;

  @Prop({ type: String, maxlength: 140 })
  parentNote?: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry' })
  ledgerEntryId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type AllowanceRequestDocument = HydratedDocument<AllowanceRequest>;
export const AllowanceRequestSchema =
  SchemaFactory.createForClass(AllowanceRequest);

/** FR-051: one pending request per child. */
AllowanceRequestSchema.index(
  { childUserId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
AllowanceRequestSchema.index({ parentUserId: 1, status: 1, createdAt: -1 });
AllowanceRequestSchema.index({ status: 1, expiresAt: 1 });
AllowanceRequestSchema.index({ childUserId: 1, createdAt: -1 });
