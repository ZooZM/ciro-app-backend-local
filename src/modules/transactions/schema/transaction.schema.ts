import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { TransactionType } from '../enum/transaction-type.enum';
import { HydratedDocument } from 'mongoose';
import { CiroFuelTransaction } from '../../ciro-fuel/ciro-fuel-transactions/schemas/ciro-fuel-transaction.schema';
import type { UUID } from 'crypto';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: String, enum: Object.values(TransactionType), required: true })
  type: TransactionType;

  @Prop({
    type: String,
    refPath: 'type',
    required: true,
  })
  transaction: UUID | CiroFuelTransaction;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ type: 1, transaction: 1 }, { unique: true });
