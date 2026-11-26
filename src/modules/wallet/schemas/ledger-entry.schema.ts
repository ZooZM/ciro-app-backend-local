import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** 026 data-model §1.2: what each entry moves, and its idempotency key format. */
export enum EntryType {
  ALLOWANCE_PAYOUT = 'allowance_payout',
  TOP_UP = 'top_up',
  PULL_BACK = 'pull_back',
  REQUEST_APPROVAL = 'request_approval',
  PURCHASE = 'purchase',
  CLEARING_ADJUSTMENT = 'clearing_adjustment',
  PURCHASE_REVERSAL = 'purchase_reversal',
  REFUND = 'refund',
  UNLINK_RETURN = 'unlink_return',
  SIMULATED_FUNDING = 'simulated_funding',
  MIGRATION_OPENING = 'migration_opening',
  CORRECTION = 'correction',
}

export type InitiatorKind = 'parent' | 'child' | 'system' | 'simulation';

export interface EntryInitiator {
  kind: InitiatorKind;
  userId?: Types.ObjectId;
}

export interface EntryRefs {
  linkId?: Types.ObjectId;
  requestId?: Types.ObjectId;
  payoutId?: Types.ObjectId;
  cardTransactionId?: Types.ObjectId;
  reversesEntryId?: Types.ObjectId;
}

export const LEDGER_IMMUTABLE_MESSAGE =
  'ledger_entries are append-only (FR-021); post a correction entry instead';

@Schema({ _id: false })
class Initiator {
  @Prop({
    type: String,
    required: true,
    enum: ['parent', 'child', 'system', 'simulation'],
  })
  kind: InitiatorKind;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;
}
const InitiatorSchema = SchemaFactory.createForClass(Initiator);

@Schema({ _id: false })
class Refs {
  @Prop({ type: Types.ObjectId }) linkId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) requestId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) payoutId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) cardTransactionId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) reversesEntryId?: Types.ObjectId;
}
const RefsSchema = SchemaFactory.createForClass(Refs);

@Schema({
  collection: 'ledger_entries',
  timestamps: { createdAt: true, updatedAt: false },
})
export class LedgerEntry {
  @Prop({ type: String, required: true })
  idempotencyKey: string;

  @Prop({ type: String, required: true, enum: Object.values(EntryType) })
  type: EntryType;

  @Prop({
    type: Number,
    required: true,
    validate: {
      validator: (v: number) => Number.isSafeInteger(v) && v > 0,
      message: 'amountHalalas must be a positive safe integer',
    },
  })
  amountHalalas: number;

  @Prop({ type: String, default: 'SAR', enum: ['SAR'] })
  currency: 'SAR';

  @Prop({ type: Types.ObjectId, ref: 'LedgerAccount', required: true })
  debitAccountId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LedgerAccount', required: true })
  creditAccountId: Types.ObjectId;

  @Prop({ type: InitiatorSchema, required: true })
  initiator: EntryInitiator;

  @Prop({ type: RefsSchema, default: {} })
  refs: EntryRefs;

  @Prop({ type: String, required: true })
  riyadhDate: string;

  createdAt?: Date;
}

export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;
export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);

LedgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true });
LedgerEntrySchema.index({ debitAccountId: 1, createdAt: -1 });
LedgerEntrySchema.index({ creditAccountId: 1, createdAt: -1 });
LedgerEntrySchema.index({ 'refs.linkId': 1, createdAt: -1 });

function rejectMutation(): never {
  throw new Error(LEDGER_IMMUTABLE_MESSAGE);
}

for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'replaceOne',
  'deleteOne',
  'deleteMany',
] as const) {
  LedgerEntrySchema.pre(op, { document: false, query: true }, rejectMutation);
}
LedgerEntrySchema.pre(
  'deleteOne',
  { document: true, query: false },
  rejectMutation,
);
LedgerEntrySchema.pre('save', function () {
  if (!this.isNew) rejectMutation();
});
