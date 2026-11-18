import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export enum WalletCurrency {
  SAR = 'SAR',
}

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
  })
  ownerId: Types.ObjectId | User;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: 'Wallet balance must be a safe integer',
    },
  })
  balance: number;

  @Prop({
    type: String,
    enum: WalletCurrency,
    required: true,
    default: WalletCurrency.SAR,
  })
  currency: WalletCurrency;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
