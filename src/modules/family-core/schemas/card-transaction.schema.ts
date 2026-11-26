import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DeclineReason, SPENDING_CATEGORIES } from '../family-core.constants';
import type { SpendingCategory } from '../family-core.constants';

export type CardTransactionKind = 'authorization' | 'refund' | 'reversal';
export type Settlement = 'authorized' | 'settled' | 'reversed';

/**
 * 026 data-model §1.6: purchase attempts, refunds and reversals. Parent and
 * link are captured at the time, so a refund after unlink credits the right
 * parent. Declined attempts are not money movements (FR-043).
 */
@Schema({
  collection: 'card_transactions',
  timestamps: { createdAt: true, updatedAt: false },
})
export class CardTransaction {
  @Prop({ type: String, required: true })
  provider: string;

  @Prop({ type: String, required: true })
  issuerTxnId: string;

  @Prop({
    type: String,
    required: true,
    enum: ['authorization', 'refund', 'reversal'],
  })
  kind: CardTransactionKind;

  @Prop({ type: Types.ObjectId, ref: 'Card', required: true })
  cardId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parentUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FamilyLink', required: true })
  linkId: Types.ObjectId;

  @Prop({ type: String, required: true, minlength: 1, maxlength: 80 })
  merchantName: string;

  @Prop({ type: String, enum: SPENDING_CATEGORIES })
  category?: SpendingCategory;

  @Prop({ type: String })
  mcc?: string;

  @Prop({
    type: Number,
    required: true,
    validate: {
      validator: (v: number) => Number.isSafeInteger(v) && v > 0,
      message: 'amountHalalas must be a positive safe integer',
    },
  })
  amountHalalas: number;

  @Prop({ type: String, required: true, enum: ['approved', 'declined'] })
  outcome: 'approved' | 'declined';

  @Prop({ type: String, enum: Object.values(DeclineReason) })
  declineReason?: DeclineReason;

  @Prop({ type: String, enum: ['authorized', 'settled', 'reversed'] })
  settlement?: Settlement;

  @Prop({ type: Number, default: 0 })
  refundedHalalas: number;

  @Prop({ type: Types.ObjectId, ref: 'CardTransaction' })
  originalTransactionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LedgerEntry' })
  ledgerEntryId?: Types.ObjectId;

  @Prop({ type: String, required: true })
  riyadhDate: string;

  @Prop({ type: String, required: true, enum: ['simulation', 'issuer'] })
  source: 'simulation' | 'issuer';

  /** Server-side authorization time (SC-004 / plan Performance Goals). */
  @Prop({ type: Number })
  decisionMs?: number;

  createdAt?: Date;
}

export type CardTransactionDocument = HydratedDocument<CardTransaction>;
export const CardTransactionSchema =
  SchemaFactory.createForClass(CardTransaction);

CardTransactionSchema.index({ provider: 1, issuerTxnId: 1 }, { unique: true });
CardTransactionSchema.index({ childUserId: 1, createdAt: -1 });
CardTransactionSchema.index({ childUserId: 1, riyadhDate: 1, kind: 1 });
