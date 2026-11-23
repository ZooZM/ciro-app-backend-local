import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  BLOCKABLE_CATEGORIES,
  BlockableCategory,
} from '../family-core.constants';

const safeInt = (min: number) => ({
  validator: (v: number) => Number.isSafeInteger(v) && v >= min,
  message: `must be a safe integer ≥ ${min}`,
});

/** 026 data-model §1.4 (FR-010–013). */
@Schema({ collection: 'allowance_settings', timestamps: true })
export class AllowanceSettings {
  @Prop({ type: Types.ObjectId, ref: 'FamilyLink', required: true })
  linkId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parentUserId: Types.ObjectId;

  @Prop({ type: Number, required: true, validate: safeInt(0) })
  monthlyAmountHalalas: number;

  @Prop({ type: Number, required: true, min: 1, max: 31 })
  payoutDay: number;

  @Prop({ type: Number, required: true, validate: safeInt(1) })
  dailyLimitHalalas: number;

  @Prop({ type: Number, required: true, validate: safeInt(1) })
  perPurchaseMaxHalalas: number;

  @Prop({ type: [String], enum: BLOCKABLE_CATEGORIES, default: [] })
  blockedCategories: BlockableCategory[];

  @Prop({ type: Boolean, default: true })
  purchaseNotifications: boolean;

  /** `YYYY-MM`; set each time the monthly amount goes from 0 to > 0 (R14). */
  @Prop({ type: String, default: null })
  payoutsActiveFromMonth: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type AllowanceSettingsDocument = HydratedDocument<AllowanceSettings>;
export const AllowanceSettingsSchema =
  SchemaFactory.createForClass(AllowanceSettings);

AllowanceSettingsSchema.index({ linkId: 1 }, { unique: true });
AllowanceSettingsSchema.index({ childUserId: 1 });
AllowanceSettingsSchema.index({ parentUserId: 1 });
