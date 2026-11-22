import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { Car } from '../../cars/schemas/car.schema';
import { FuelTypes } from '../../fuel-prices/enum/fuel-types-enum';
import { PaymentVerification } from '../../payment-verifications/schemas/payment-verification.schema';
import { Station } from '../../stations/schemas/station.schema';
import { User } from '../../../users/schemas/user.schema';
import type { UUID } from 'crypto';
import { TransactionStatus } from '../enum/transaction-status.enum';

export type CiroFuelTransactionDocument = HydratedDocument<CiroFuelTransaction>;

@Schema()
export class CiroFuelTransaction {
  @Prop({ type: String, required: true, unique: true })
  _id: UUID;

  @Prop({ type: Number, required: true })
  amountPaid: number;

  @Prop({ type: Number, required: true })
  amountRefueled: number;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Station.name,
    required: true,
  })
  station: Station | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Car.name,
    required: true,
    index: true,
  })
  car: Car | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  driver: User | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  owner: User | Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: PaymentVerification.name,
    required: true,
  })
  paymentVerification: PaymentVerification | Types.ObjectId;

  @Prop({ type: String, enum: FuelTypes, required: true })
  fuelType: FuelTypes;

  @Prop({
    type: String,
    enum: TransactionStatus,
    required: true,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Prop({ type: Date })
  paymentProcessingStartedAt?: Date;

  @Prop({ type: Date })
  transferSucceededAt?: Date;

  @Prop({ type: String })
  transferProviderReference?: string;
}

export const CiroFuelTransactionSchema =
  SchemaFactory.createForClass(CiroFuelTransaction);

CiroFuelTransactionSchema.index({ paymentVerification: 1 }, { unique: true });
CiroFuelTransactionSchema.index({ status: 1, paymentProcessingStartedAt: 1 });
