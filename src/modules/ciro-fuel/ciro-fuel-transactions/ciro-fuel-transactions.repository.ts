import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';
import {
  CiroFuelTransaction,
  CiroFuelTransactionDocument,
} from './schemas/ciro-fuel-transaction.schema';
import { TransactionStatus } from './enum/transaction-status.enum';

@Injectable()
export class CiroFuelTransactionsRepository {
  constructor(
    @InjectModel(CiroFuelTransaction.name)
    private readonly ciroFuelTransactionsModel: Model<CiroFuelTransactionDocument>,
  ) {}

  /**
   * Upserts by verification ID so retrying the verification handoff reuses
   * its transaction.
   */
  async create(
    createCiroFuelTransactionDto: CreateCiroFuelTransactionDto,
  ): Promise<CiroFuelTransactionDocument> {
    const { station, car, driver, owner, paymentVerification, ...rest } =
      createCiroFuelTransactionDto;
    const paymentVerificationId = new Types.ObjectId(paymentVerification);
    const transaction = await this.ciroFuelTransactionsModel
      .findOneAndUpdate(
        { paymentVerification: paymentVerificationId },
        {
          // A repeated handoff must not reset an existing transaction's status.
          $setOnInsert: {
            _id: randomUUID(),
            ...rest,
            station: new Types.ObjectId(station),
            car: new Types.ObjectId(car),
            driver: new Types.ObjectId(driver),
            owner: new Types.ObjectId(owner),
            paymentVerification: paymentVerificationId,
            status: TransactionStatus.PENDING,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
    if (!transaction) {
      throw new Error('Fuel transaction upsert did not return a document');
    }
    return transaction;
  }

  findById(id: string): Promise<CiroFuelTransactionDocument | null> {
    return this.ciroFuelTransactionsModel.findById(id).exec();
  }

  findAllByOwnerId(ownerId: string): Promise<CiroFuelTransactionDocument[]> {
    return this.ciroFuelTransactionsModel.find({ owner: ownerId }).exec();
  }

  /**
   * Atomically claims pending work or a processing transaction whose lease
   * expired. Returns null when another worker owns a fresh claim or it is done.
   */
  claimForPayment(
    id: string,
    staleBefore: Date,
  ): Promise<CiroFuelTransactionDocument | null> {
    // Keep eligibility and the claim in one atomic update so workers cannot
    // both acquire the same fresh processing lease.
    return this.ciroFuelTransactionsModel
      .findOneAndUpdate(
        {
          _id: id,
          $or: [
            { status: TransactionStatus.PENDING },
            {
              status: TransactionStatus.PROCESSING,
              paymentProcessingStartedAt: { $lt: staleBefore },
            },
            {
              status: TransactionStatus.PROCESSING,
              paymentProcessingStartedAt: { $exists: false },
            },
          ],
        },
        {
          $set: {
            status: TransactionStatus.PROCESSING,
            paymentProcessingStartedAt: new Date(),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  markTransferSucceeded(
    id: string,
    providerReference: string,
  ): Promise<CiroFuelTransactionDocument | null> {
    return this.ciroFuelTransactionsModel
      .findOneAndUpdate(
        { _id: id, status: TransactionStatus.PROCESSING },
        {
          $set: {
            transferSucceededAt: new Date(),
            transferProviderReference: providerReference,
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  markPaymentCompleted(
    id: string,
  ): Promise<CiroFuelTransactionDocument | null> {
    return this.ciroFuelTransactionsModel
      .findOneAndUpdate(
        { _id: id, status: TransactionStatus.PROCESSING },
        {
          $set: { status: TransactionStatus.COMPLETED },
          $unset: { paymentProcessingStartedAt: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  markPaymentFailed(id: string): Promise<CiroFuelTransactionDocument | null> {
    return this.ciroFuelTransactionsModel
      .findOneAndUpdate(
        { _id: id, status: TransactionStatus.PROCESSING },
        {
          $set: { status: TransactionStatus.FAILED },
          $unset: { paymentProcessingStartedAt: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  returnPaymentToPending(
    id: string,
  ): Promise<CiroFuelTransactionDocument | null> {
    return this.ciroFuelTransactionsModel
      .findOneAndUpdate(
        { _id: id, status: TransactionStatus.PROCESSING },
        {
          $set: { status: TransactionStatus.PENDING },
          $unset: { paymentProcessingStartedAt: 1 },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  /** Returns IDs for pending work and processing claims eligible for recovery. */
  async findIdsNeedingPaymentProcessing(staleBefore: Date): Promise<string[]> {
    const transactions = await this.ciroFuelTransactionsModel
      .find({
        // The worker's follow-up claim decides ownership; this query only
        // discovers pending or abandoned work for the recovery sweep.
        $or: [
          { status: TransactionStatus.PENDING },
          {
            status: TransactionStatus.PROCESSING,
            paymentProcessingStartedAt: { $lt: staleBefore },
          },
          {
            status: TransactionStatus.PROCESSING,
            paymentProcessingStartedAt: { $exists: false },
          },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    return transactions.map(({ _id }) => _id.toString());
  }
}
