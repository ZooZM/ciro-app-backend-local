import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LedgerAccountKind = 'user_wallet' | 'child_balance' | 'system';
export type SystemAccountCode =
  | 'card_settlement'
  | 'simulation_funding'
  | 'fuel_migration';

export const SYSTEM_ACCOUNT_CODES: SystemAccountCode[] = [
  'card_settlement',
  'simulation_funding',
  'fuel_migration',
];

/**
 * 026 data-model §1.1. `balanceHalalas` is a cache of Σcredits − Σdebits over
 * `ledger_entries`; it only ever changes inside the same transaction that
 * inserts the entry (research R2), and is checked nightly (R15).
 */
@Schema({ collection: 'ledger_accounts', timestamps: true })
export class LedgerAccount {
  @Prop({
    type: String,
    required: true,
    enum: ['user_wallet', 'child_balance', 'system'],
  })
  kind: LedgerAccountKind;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required(this: LedgerAccount) {
      return this.kind !== 'system';
    },
  })
  ownerUserId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: SYSTEM_ACCOUNT_CODES,
    required(this: LedgerAccount) {
      return this.kind === 'system';
    },
  })
  systemCode?: SystemAccountCode;

  @Prop({ type: String, default: 'SAR', enum: ['SAR'] })
  currency: 'SAR';

  @Prop({
    type: Number,
    default: 0,
    validate: {
      validator: (v: number) => Number.isSafeInteger(v),
      message: 'balanceHalalas must be a safe integer',
    },
  })
  balanceHalalas: number;

  @Prop({ type: Boolean, default: false })
  allowNegative: boolean;

  @Prop({ type: Boolean, default: false })
  frozen: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export type LedgerAccountDocument = HydratedDocument<LedgerAccount>;
export const LedgerAccountSchema = SchemaFactory.createForClass(LedgerAccount);

LedgerAccountSchema.index(
  { kind: 1, ownerUserId: 1 },
  { unique: true, partialFilterExpression: { ownerUserId: { $exists: true } } },
);
LedgerAccountSchema.index(
  { systemCode: 1 },
  { unique: true, partialFilterExpression: { systemCode: { $exists: true } } },
);
