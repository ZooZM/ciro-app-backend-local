import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CARD_STATUSES } from '../family-core.constants';
import type { CardStatus } from '../family-core.constants';

/** 026 data-model §1.5. `active ⇄ paused` (parent); `active | paused → inactive` (unlink, terminal). */
@Schema({ collection: 'cards', timestamps: true })
export class Card {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  childUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FamilyLink', required: true })
  linkId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['stub', 'nymcard'] })
  provider: 'stub' | 'nymcard';

  @Prop({ type: String, required: true })
  cardRef: string;

  @Prop({ type: String, required: true })
  last4: string;

  @Prop({
    type: String,
    required: true,
    enum: CARD_STATUSES,
    default: 'active',
  })
  status: CardStatus;

  @Prop({ type: Date })
  statusChangedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  statusChangedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export type CardDocument = HydratedDocument<Card>;
export const CardSchema = SchemaFactory.createForClass(Card);

CardSchema.index({ provider: 1, cardRef: 1 }, { unique: true });
CardSchema.index({ childUserId: 1, status: 1 });
CardSchema.index({ linkId: 1 });
