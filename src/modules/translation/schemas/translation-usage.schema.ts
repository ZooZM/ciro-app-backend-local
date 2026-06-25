import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Reason a translation usage session ended (data-model.md §1.2). */
export enum TranslationUsageEndReason {
  USER_UNSUBSCRIBED = 'user_unsubscribed',
  CREDITS_EXHAUSTED = 'credits_exhausted',
  LEFT_CALL = 'left_call',
  SERVICE_ERROR = 'service_error',
  PIPELINE_TORN_DOWN = 'pipeline_torn_down',
}

export type TranslationUsageDocument = TranslationUsage & Document;

/**
 * Per-listener, per-session billing/audit record (data-model.md §1.2).
 * Upserted at session start; `secondsConsumed`/counts flushed periodically
 * and finalized with `endedAt`/`endReason` on teardown.
 */
@Schema({ timestamps: true })
export class TranslationUsage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  listenerId: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  roomId: string;

  @Prop({ type: String, required: true })
  speakerId: string;

  @Prop({ type: String, required: true })
  targetLanguage: string;

  @Prop({ type: [String], default: [] })
  detectedSourceLanguages: string[];

  @Prop({ type: Number, default: 0, min: 0 })
  secondsConsumed: number;

  @Prop({ type: Number, default: 0, min: 0 })
  interimCount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  finalCount: number;

  @Prop({
    type: String,
    enum: Object.values(TranslationUsageEndReason),
    required: false,
  })
  endReason?: TranslationUsageEndReason;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date, required: false })
  endedAt?: Date;
}

export const TranslationUsageSchema =
  SchemaFactory.createForClass(TranslationUsage);

TranslationUsageSchema.index({ listenerId: 1, startedAt: -1 });
TranslationUsageSchema.index({ roomId: 1 });
