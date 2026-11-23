import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export interface AccountMismatch {
  accountId: Types.ObjectId;
  cachedHalalas: number;
  derivedHalalas: number;
}

export interface CounterRewrite {
  childUserId: string;
  riyadhDate: string;
  from: number;
  to: number;
}

export interface ExtraCheckResult {
  name: string;
  ok: boolean;
  details?: Record<string, unknown>;
}

/** 026 data-model §1.12: one document per reconciliation run (R15). */
@Schema({ collection: 'ledger_reconciliation_reports' })
export class ReconciliationReport {
  @Prop({ type: Date, required: true })
  runAt: Date;

  @Prop({ type: Number, required: true })
  accountsChecked: number;

  @Prop({
    type: [
      {
        _id: false,
        accountId: Types.ObjectId,
        cachedHalalas: Number,
        derivedHalalas: Number,
      },
    ],
    default: [],
  })
  mismatches: AccountMismatch[];

  @Prop({
    type: [
      {
        _id: false,
        childUserId: String,
        riyadhDate: String,
        from: Number,
        to: Number,
      },
    ],
    default: [],
  })
  counterRewrites: CounterRewrite[];

  @Prop({
    type: [{ _id: false, name: String, ok: Boolean, details: Object }],
    default: [],
  })
  checks: ExtraCheckResult[];

  @Prop({ type: String, required: true, enum: ['ok', 'mismatch'] })
  status: 'ok' | 'mismatch';
}

export type ReconciliationReportDocument =
  HydratedDocument<ReconciliationReport>;
export const ReconciliationReportSchema =
  SchemaFactory.createForClass(ReconciliationReport);

ReconciliationReportSchema.index({ runAt: -1 });
