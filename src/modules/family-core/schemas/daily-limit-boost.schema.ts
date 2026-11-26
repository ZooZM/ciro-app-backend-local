import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * 026 data-model §1.9 (FR-055). `riyadhDate` is the Ciro day of the approval;
 * older documents are ignored, which is the FR-045 reset.
 */
@Schema({ collection: 'daily_limit_boosts', timestamps: true })
export class DailyLimitBoost {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({ type: String, required: true })
  riyadhDate: string;

  @Prop({ type: Number, required: true, default: 0 })
  amountHalalas: number;

  @Prop({ type: [Types.ObjectId], default: [] })
  requestIds: Types.ObjectId[];
}

export type DailyLimitBoostDocument = HydratedDocument<DailyLimitBoost>;
export const DailyLimitBoostSchema =
  SchemaFactory.createForClass(DailyLimitBoost);

DailyLimitBoostSchema.index(
  { childUserId: 1, riyadhDate: 1 },
  { unique: true },
);
