import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { Car } from '../../cars/schemas/car.schema';
import { User } from '../../users/schemas/user.schema';

export type CarOwnershipDocument = HydratedDocument<CarOwnership>;
export type CarOwnershipLean = CarOwnership & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class CarOwnership {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  owner: Types.ObjectId | User;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Car.name, required: true })
  car: Types.ObjectId | Car;

  @Prop({ type: String, required: true, trim: true })
  category: string;
}

export const CarOwnershipSchema = SchemaFactory.createForClass(CarOwnership);

CarOwnershipSchema.index({ owner: 1, car: 1, category: 1 }, { unique: true });
