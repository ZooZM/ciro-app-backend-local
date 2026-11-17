import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { VehicleCategory } from '../enum/vehicle-category.enum';
import { User } from '../../users/schemas/user.schema';
import { FuelTypes } from '../../fuel-prices/enum/fuel-types-enum';

export type CarDocument = HydratedDocument<Car>;
export type CarLean = Car & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class Car {
  @Prop({ type: String, required: true, trim: true })
  model: string;

  @Prop({ type: String, required: true, trim: true })
  brand: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
    set: (v: string) => v.replace(/\s+/g, ''),
  })
  licensePlate: string;

  @Prop({ type: String, enum: VehicleCategory, required: true })
  vehicleCategory: VehicleCategory;

  @Prop({ type: String, enum: FuelTypes, required: true })
  fuelType: FuelTypes;

  @Prop({ type: String, required: true, trim: true })
  image: string;

  @Prop({ type: Boolean, required: true, default: true })
  isActive: boolean;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: User.name }],
    default: [],
  })
  drivers?: (Types.ObjectId | User)[];

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  owner: Types.ObjectId | User;

  @Prop({ type: Boolean, required: true, default: false })
  isGpsEnabled: boolean;

  @Prop({
    type: String,
    required: false,
    trim: true,
    unique: true,
    sparse: true,
  })
  gpsId?: string;

  @Prop({
    type: String,
    required: false,
    trim: true,
    unique: true,
    sparse: true,
  })
  nfcId?: string;

  @Prop({ type: Number, required: true })
  tankCapacity: number;

  @Prop({ type: String, required: false, trim: true, index: true })
  bankCardNumber?: string;
}

export const CarSchema = SchemaFactory.createForClass(Car);

CarSchema.index({ nfcId: 1, isActive: 1 });
