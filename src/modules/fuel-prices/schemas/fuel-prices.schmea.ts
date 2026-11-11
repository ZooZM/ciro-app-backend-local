import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { FuelTypes } from '../enum/fuel-types-enum';

// export const FUEL_PRICES_ID = new Types.ObjectId('6af43875305aa6d9681d22b6');
export const FUEL_PRICES_ID = 'fuel_prices';

export type FuelPricesDocument = HydratedDocument<FuelPrices>;

@Schema({ timestamps: true })
export class FuelPrices implements Record<FuelTypes, number> {
  @Prop({ type: String, default: FUEL_PRICES_ID, immutable: true })
  _id: string;

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
