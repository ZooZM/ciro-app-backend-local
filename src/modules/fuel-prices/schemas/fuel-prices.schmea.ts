import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const FUEL_PRICES_ID = new Types.ObjectId('6af43875305aa6d9681d22b6');

export type FuelPricesDocument = HydratedDocument<FuelPrices>;

@Schema({ timestamps: true })
export class FuelPrices {
  @Prop({ type: Types.ObjectId, default: FUEL_PRICES_ID, immutable: true })
  _id: Types.ObjectId;

  @Prop({ type: Number, required: true })
  gasoline_91: number;

  @Prop({ type: Number, required: true })
  gasoline_95: number;

  @Prop({ type: Number, required: true })
  gasoline_98: number;

  @Prop({ type: Number, required: true })
  diesel: number;

  @Prop({ type: Number, required: true })
  kerosene: number;
}

export const FuelPricesSchema = SchemaFactory.createForClass(FuelPrices);
