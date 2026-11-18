import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Schema as MongooseSchema, HydratedDocument } from 'mongoose';
import { Car } from '../../cars/schemas/car.schema';
import { Station } from '../../stations/schemas/station.schema';
import { User } from '../../../users/schemas/user.schema';
import { PaymentVerificationStatus } from '../enum/payment-verification-status.enum';
import { FuelTypes } from '../../fuel-prices/enum/fuel-types-enum';
import { PaymentVerificationRejectionReason } from '../enum/payment-verification-rejection-reason.enum';
import { ACTIVE_PAYMENT_VERIFICATION_STATUSES } from '../consts/payment-verification.constants';

export type PaymentVerificationDocument = HydratedDocument<PaymentVerification>;

// timestamps is required: session expiry is based on createdAt
@Schema({ timestamps: true })
export class PaymentVerification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Car.name, required: true })
  car: Types.ObjectId | Car;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  driver: Types.ObjectId | User;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Station.name,
    required: true,
  })
  station: Types.ObjectId | Station;

  @Prop({
    type: String,
    enum: PaymentVerificationStatus, // picks up the new EXPIRED value automatically
    default: PaymentVerificationStatus.NFC_SCANNED,
    required: true,
  })
  status?: PaymentVerificationStatus;

  @Prop({ type: String, trim: true })
  carDashboardImageBefore?: string;

  @Prop({ type: String, trim: true })
  carDashboardImageAfter?: string;

  @Prop({ type: String, trim: true })
  pumper_image?: string;

  @Prop({ type: String, enum: FuelTypes })
  fuelType?: FuelTypes;

  @Prop({ type: Number, min: 0 })
  liters?: number;

  @Prop({ type: Number, min: 0 })
  unitPrice?: number;

  @Prop({ type: Number, min: 0 })
  totalAmount?: number;

  @Prop({ type: Number, min: 0 })
  authoritativeUnitPrice?: number;

  @Prop({ type: Number, min: 0 })
  calculatedTotalAmount?: number;

  @Prop({
    type: [String],
    enum: Object.values(PaymentVerificationRejectionReason),
    default: [],
  })
  rejectionReasons: PaymentVerificationRejectionReason[];

  // Audit snapshots written at completion, so later car/station edits
  // don't change how a past decision looks.
  @Prop({ type: String, enum: FuelTypes })
  carFuelTypeSnapshot?: FuelTypes;

  @Prop({ type: Number, min: 0 })
  carTankCapacitySnapshot?: number;

  @Prop({ type: [String], enum: Object.values(FuelTypes) })
  stationFuelTypesSnapshot?: FuelTypes[];

  @Prop({ type: Date })
  completedAt?: Date;

  // Managed by `timestamps: true`; declared only so TypeScript knows about it.
  createdAt?: Date;
  updatedAt?: Date;
}

export const PaymentVerificationSchema =
  SchemaFactory.createForClass(PaymentVerification);

// At most one open session per car. Terminal states (accepted / rejected /
// expired) are excluded, so a driver can start again after a rejection.
PaymentVerificationSchema.index(
  { car: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ACTIVE_PAYMENT_VERIFICATION_STATUSES },
    },
  },
);
