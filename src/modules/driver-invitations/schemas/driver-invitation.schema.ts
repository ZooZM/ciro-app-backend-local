import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Schema as MongooseSchema, HydratedDocument } from 'mongoose';
import { Car } from '../../cars/schemas/car.schema';
import { User } from '../../users/schemas/user.schema';
import { DriverInvitationStatus } from '../enum/driver-invitation-status.enum';

export type DriverInvitationDocument = HydratedDocument<DriverInvitation>;

@Schema()
export class DriverInvitation {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  owner: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  driver: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Car.name, required: true })
  car: Types.ObjectId | Partial<Car>;

  @Prop({
    type: String,
    enum: DriverInvitationStatus,
    required: true,
    default: DriverInvitationStatus.SENT,
  })
  status: DriverInvitationStatus;
}

export const DriverInvitationSchema =
  SchemaFactory.createForClass(DriverInvitation);

DriverInvitationSchema.index({ owner: 1, driver: 1, car: 1 }, { unique: true });
