import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { Car } from 'src/modules/cars/schemas/car.schema';
import { FuelTypes } from 'src/modules/fuel-prices/enum/fuel-types-enum';
import { PaymentVerification } from 'src/modules/payment-verification/schemas/payment-verification.schema';
import { Station } from 'src/modules/stations/schemas/station.schema';
import { User } from 'src/modules/users/schemas/user.schema';

export type CiroFuelTransactionDocument =
  HydratedDocument<CiroFuelTransaction>;

@Schema({ timestamps: true })
export class CiroFuelTransaction {
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
}

export const CiroFuelTransactionSchema =
  SchemaFactory.createForClass(CiroFuelTransaction);
