import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PaymentVerification,
  PaymentVerificationDocument,
} from './schemas/payment-verification.schema';
import { PaymentVerificationStatus } from './enum/payment-verification-status.enum';
import { ACTIVE_PAYMENT_VERIFICATION_STATUSES } from './consts/payment-verification.constants';

@Injectable()
export class PaymentVerificationRepository {
  constructor(
    @InjectModel(PaymentVerification.name)
    private readonly paymentVerificationModel: Model<PaymentVerificationDocument>,
  ) {}

  async create(
    carId: Types.ObjectId,
    driverId: string,
    stationId: Types.ObjectId,
  ): Promise<PaymentVerificationDocument> {
    return this.paymentVerificationModel.create({
      car: carId,
      driver: new Types.ObjectId(driverId),
      station: stationId,
    });
  }

  /** Marks the car's idle open sessions as expired so they free the unique slot. */
  async expireStaleForCar(carId: Types.ObjectId, cutoff: Date): Promise<void> {
    await this.paymentVerificationModel
      .updateMany(
        {
          car: carId,
          status: { $in: ACTIVE_PAYMENT_VERIFICATION_STATUSES },
          updatedAt: { $lt: cutoff },
        },
        { $set: { status: PaymentVerificationStatus.EXPIRED } },
      )
      .exec();
  }

  findByIdForDriver(
    id: string,
    driverId: string,
  ): Promise<PaymentVerificationDocument | null> {
    return this.paymentVerificationModel
      .findOne({ _id: id, driver: driverId })
      .exec();
  }

  /**
   * Atomic transition: only applies if the session is at the expected status
   * and has not been idle longer than the allowed window.
   */
  updateForDriverAtStatus(
    id: string,
    driverId: string,
    expectedStatus: PaymentVerificationStatus,
    changes: Partial<PaymentVerification>,
    notIdleSince: Date,
  ): Promise<PaymentVerificationDocument | null> {
    return this.paymentVerificationModel
      .findOneAndUpdate(
        {
          _id: id,
          driver: driverId,
          status: expectedStatus,
          updatedAt: { $gte: notIdleSince },
        },
        { $set: changes },
        { new: true, runValidators: true },
      )
      .exec();
  }
}
