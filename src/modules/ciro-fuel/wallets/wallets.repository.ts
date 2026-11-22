import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Wallet,
  WalletCurrency,
  WalletDocument,
  WalletReservationStatus,
} from './schemas/wallet.schema';

export interface WalletReservationResult {
  wallet: WalletDocument;
  status: WalletReservationStatus;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class WalletsRepository {
  constructor(
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<WalletDocument>,
  ) {}

  async findOrCreateByOwnerId(ownerId: string): Promise<WalletDocument> {
    try {
      const wallet = await this.walletModel
        .findOneAndUpdate(
          { ownerId: new Types.ObjectId(ownerId) },
          {
            $setOnInsert: {
              balance: 0,
              reservedBalance: 0,
              currency: WalletCurrency.SAR,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .exec();
      if (!wallet) throw new Error('Wallet upsert did not return a document');
      return wallet;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const wallet = await this.findByOwnerId(ownerId);
        if (wallet) return wallet;
      }
      throw error;
    }
  }

  findByOwnerId(ownerId: string): Promise<WalletDocument | null> {
    return this.walletModel
      .findOne({ ownerId: new Types.ObjectId(ownerId) })
      .exec();
  }

  credit(ownerId: string, amount: number): Promise<WalletDocument | null> {
    return this.walletModel
      .findOneAndUpdate(
        {
          ownerId: new Types.ObjectId(ownerId),
          $expr: {
            $lte: [{ $add: ['$balance', amount] }, Number.MAX_SAFE_INTEGER],
          },
        },
        { $inc: { balance: amount } },
        { new: true, runValidators: true },
      )
      .exec();
  }

  debit(ownerId: string, amount: number): Promise<WalletDocument | null> {
    return this.walletModel
      .findOneAndUpdate(
        {
          ownerId: new Types.ObjectId(ownerId),
          // Ordinary debits must not consume funds held for pending payments.
          $expr: {
            $gte: [
              {
                $subtract: ['$balance', { $ifNull: ['$reservedBalance', 0] }],
              },
              amount,
            ],
          },
        },
        { $inc: { balance: -amount } },
        { new: true, runValidators: true },
      )
      .exec();
  }

  async reservePayment(
    ownerId: string,
    transactionId: string,
    amount: number,
  ): Promise<WalletReservationResult | null> {
    const ownerObjectId = new Types.ObjectId(ownerId);
    // Reuse a reservation on retry instead of reserving the same payment twice.
    const existing = await this.walletModel
      .findOne({
        ownerId: ownerObjectId,
        'paymentReservations.transactionId': transactionId,
      })
      .exec();
    const existingResult = this.getReservationResult(
      existing,
      transactionId,
      amount,
    );

    if (existingResult) {
      if (existingResult.status !== WalletReservationStatus.RELEASED) {
        return existingResult;
      }

      // Re-reserve only if the owner still has enough unreserved balance.
      const reReserved = await this.walletModel
        .findOneAndUpdate(
          {
            ownerId: ownerObjectId,
            paymentReservations: {
              $elemMatch: {
                transactionId,
                amount,
                status: WalletReservationStatus.RELEASED,
              },
            },
            $expr: {
              $gte: [
                {
                  $subtract: ['$balance', { $ifNull: ['$reservedBalance', 0] }],
                },
                amount,
              ],
            },
          },
          {
            $inc: { reservedBalance: amount },
            $set: {
              'paymentReservations.$.status': WalletReservationStatus.RESERVED,
            },
          },
          { new: true, runValidators: true },
        )
        .exec();
      const currentReservation =
        this.getReservationResult(reReserved, transactionId, amount) ??
        this.getReservationResult(
          await this.walletModel
            .findOne({
              ownerId: ownerObjectId,
              'paymentReservations.transactionId': transactionId,
            })
            .exec(),
          transactionId,
          amount,
        );
      return currentReservation?.status === WalletReservationStatus.RELEASED
        ? null
        : currentReservation;
    }

    // Check available balance and insert the reservation in one atomic update.
    const reserved = await this.walletModel
      .findOneAndUpdate(
        {
          ownerId: ownerObjectId,
          'paymentReservations.transactionId': { $ne: transactionId },
          $expr: {
            $gte: [
              {
                $subtract: ['$balance', { $ifNull: ['$reservedBalance', 0] }],
              },
              amount,
            ],
          },
        },
        {
          $inc: { reservedBalance: amount },
          $push: {
            paymentReservations: {
              transactionId,
              amount,
              status: WalletReservationStatus.RESERVED,
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (reserved) {
      return this.getReservationResult(reserved, transactionId, amount);
    }

    // Another attempt may have created the reservation after the first read.
    const afterRace = await this.walletModel
      .findOne({
        ownerId: ownerObjectId,
        'paymentReservations.transactionId': transactionId,
      })
      .exec();
    const currentReservation = this.getReservationResult(
      afterRace,
      transactionId,
      amount,
    );
    return currentReservation?.status === WalletReservationStatus.RELEASED
      ? null
      : currentReservation;
  }

  async settlePayment(
    ownerId: string,
    transactionId: string,
    amount: number,
  ): Promise<WalletDocument | null> {
    // Debit and release the hold together, and only from the RESERVED state.
    const wallet = await this.walletModel
      .findOneAndUpdate(
        {
          ownerId: new Types.ObjectId(ownerId),
          paymentReservations: {
            $elemMatch: {
              transactionId,
              amount,
              status: WalletReservationStatus.RESERVED,
            },
          },
        },
        {
          $inc: { balance: -amount, reservedBalance: -amount },
          $set: {
            'paymentReservations.$.status': WalletReservationStatus.SETTLED,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (wallet) return wallet;

    // Treat a repeated settlement as success without debiting a second time.
    const existing = await this.walletModel
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
        'paymentReservations.transactionId': transactionId,
      })
      .exec();
    return (
      this.getReservationResult(
        existing,
        transactionId,
        amount,
        WalletReservationStatus.SETTLED,
      )?.wallet ?? null
    );
  }

  async releasePayment(
    ownerId: string,
    transactionId: string,
    amount: number,
  ): Promise<WalletDocument | null> {
    // Release only an active hold; retries cannot reduce reserved funds twice.
    const wallet = await this.walletModel
      .findOneAndUpdate(
        {
          ownerId: new Types.ObjectId(ownerId),
          paymentReservations: {
            $elemMatch: {
              transactionId,
              amount,
              status: WalletReservationStatus.RESERVED,
            },
          },
        },
        {
          $inc: { reservedBalance: -amount },
          $set: {
            'paymentReservations.$.status': WalletReservationStatus.RELEASED,
          },
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (wallet) return wallet;

    const existing = await this.walletModel
      .findOne({
        ownerId: new Types.ObjectId(ownerId),
        'paymentReservations.transactionId': transactionId,
      })
      .exec();
    return (
      this.getReservationResult(
        existing,
        transactionId,
        amount,
        WalletReservationStatus.RELEASED,
      )?.wallet ?? null
    );
  }

  private getReservationResult(
    wallet: WalletDocument | null,
    transactionId: string,
    amount: number,
    expectedStatus?: WalletReservationStatus,
  ): WalletReservationResult | null {
    if (!wallet) return null;
    const reservation = wallet.paymentReservations?.find(
      (item) => item.transactionId === transactionId,
    );
    if (!reservation) return null;
    if (reservation.amount !== amount) {
      throw new ConflictException(
        'Payment reservation amount does not match the transaction',
      );
    }
    if (expectedStatus && reservation.status !== expectedStatus) return null;
    return { wallet, status: reservation.status };
  }
}
