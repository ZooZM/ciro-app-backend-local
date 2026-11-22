import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../../users/schemas/user.schema';

export enum WalletCurrency {
  SAR = 'SAR',
}

export enum WalletReservationStatus {
  RESERVED = 'reserved',
  SETTLED = 'settled',
  RELEASED = 'released',
}

@Schema({ _id: false })
export class WalletPaymentReservation {
  @Prop({ type: String, required: true })
  transactionId: string;

  @Prop({
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: 'Reservation amount must be a safe integer',
    },
  })
  amount: number;

  @Prop({
    type: String,
    enum: WalletReservationStatus,
    required: true,
  })
  status: WalletReservationStatus;
}

const WalletPaymentReservationSchema = SchemaFactory.createForClass(
  WalletPaymentReservation,
);

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
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: (value: number) => Number.isSafeInteger(value),
      message: 'Reserved wallet balance must be a safe integer',
    },
  })
  reservedBalance: number;

  @Prop({ type: [WalletPaymentReservationSchema], default: [] })
  paymentReservations: WalletPaymentReservation[];

  @Prop({
    type: String,
    enum: WalletCurrency,
    required: true,
    default: WalletCurrency.SAR,
  })
  currency: WalletCurrency;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
