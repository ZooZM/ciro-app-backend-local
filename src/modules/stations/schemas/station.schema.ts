import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { FuelTypes } from 'src/modules/fuel-prices/enum/fuel-types-enum';

@Schema({ _id: false })
export class Location {
  @Prop({ type: String, enum: ['Point'], default: 'Point', required: true })
  type: 'Point';

  @Prop({
    type: [Number],
    required: true,
    validate: [
      {
        validator: (v: number[]) => v.length === 2,
        message: 'Coordinates must be [lng, lat]',
      },
      {
        validator: ([lng, lat]: number[]) =>
          lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
        message: 'Coordinates out of range',
      },
    ],
  })
  coordinates: number[];
}

export type StationDocument = HydratedDocument<Station>;

@Schema({ timestamps: true })
export class Station {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Location, required: true, index: '2dsphere' })
  location: Location;

  @Prop({
    type: [String],
    enum: Object.values(FuelTypes),
    required: true,
    validate: [
      {
        validator: (val: FuelTypes[]) => val.length > 0,
        message: 'At least one fuel type is required',
      },
      {
        validator: (val: FuelTypes[]) => new Set(val).size === val.length,
        message: 'Duplicate fuel types are not allowed',
      },
    ],
  })
  fuelTypes: FuelTypes[];

  @Prop({ type: String, required: true })
  address: string;
}

export const StationSchema = SchemaFactory.createForClass(Station);

StationSchema.index({ name: 1, address: 1 }, { unique: true });
