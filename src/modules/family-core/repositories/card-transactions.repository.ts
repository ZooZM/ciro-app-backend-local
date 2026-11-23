import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  CardTransaction,
  CardTransactionDocument,
  Settlement,
} from '../schemas/card-transaction.schema';
import { beforeCursor, Cursor, oid } from '../pagination';

@Injectable()
export class CardTransactionsRepository extends BaseRepository<CardTransactionDocument> {
  constructor(
    @InjectModel(CardTransaction.name) model: Model<CardTransactionDocument>,
  ) {
    super(model);
  }

  findById(id: string | Types.ObjectId, session?: ClientSession) {
    return this.model
      .findById(oid(id))
      .session(session ?? null)
      .exec();
  }

  findByIds(ids: Types.ObjectId[]) {
    return this.model.find({ _id: { $in: ids } }).exec();
  }

  findByIssuerTxn(
    provider: string,
    issuerTxnId: string,
    session?: ClientSession,
  ) {
    return this.model
      .findOne({ provider, issuerTxnId })
      .session(session ?? null)
      .exec();
  }

  async insert(data: Partial<CardTransaction>, session?: ClientSession) {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /**
   * FR-044: guarded `$inc` of `refundedHalalas`, never past the original
   * amount. Returns false when the guard did not match.
   */
  async incRefunded(
    id: Types.ObjectId,
    amount: number,
    session: ClientSession,
  ): Promise<boolean> {
    const res = await this.model
      .updateOne(
        {
          _id: id,
          kind: 'authorization',
          outcome: 'approved',
          $expr: {
            $lte: [{ $add: ['$refundedHalalas', amount] }, '$amountHalalas'],
          },
        },
        { $inc: { refundedHalalas: amount } },
        { session },
      )
      .exec();
    return res.modifiedCount === 1;
  }

  async setLedgerEntry(
    id: Types.ObjectId,
    ledgerEntryId: Types.ObjectId,
    session: ClientSession,
  ) {
    await this.model
      .updateOne({ _id: id }, { $set: { ledgerEntryId } }, { session })
      .exec();
  }

  async setSettlement(
    id: Types.ObjectId,
    settlement: Settlement,
    session: ClientSession,
  ) {
    await this.model
      .updateOne({ _id: id }, { $set: { settlement } }, { session })
      .exec();
  }

  /** Σ approved authorizations for a child on a Riyadh date. */
  async sumApprovedOn(
    childUserId: Types.ObjectId,
    riyadhDate: string,
  ): Promise<number> {
    const [row] = await this.model.aggregate<{ total: number }>([
      {
        $match: {
          childUserId,
          riyadhDate,
          kind: 'authorization',
          outcome: 'approved',
        },
      },
      { $group: { _id: null, total: { $sum: '$amountHalalas' } } },
    ]);
    return row?.total ?? 0;
  }

  /** Σ refunds/reversals made on `riyadhDate` of purchases made on that same date. */
  async sumSameDayReturnsOn(
    childUserId: Types.ObjectId,
    riyadhDate: string,
  ): Promise<number> {
    const [row] = await this.model.aggregate<{ total: number }>([
      {
        $match: {
          childUserId,
          riyadhDate,
          kind: { $in: ['refund', 'reversal'] },
          outcome: 'approved',
        },
      },
      {
        $lookup: {
          from: this.model.collection.name,
          localField: 'originalTransactionId',
          foreignField: '_id',
          as: 'original',
        },
      },
      { $unwind: '$original' },
      { $match: { 'original.riyadhDate': riyadhDate } },
      { $group: { _id: null, total: { $sum: '$amountHalalas' } } },
    ]);
    return row?.total ?? 0;
  }

  /** Every card row for the activity feed: purchases, declines, refunds, reversals. */
  findFeed(
    childUserId: Types.ObjectId,
    opts: { since?: Date; before?: Cursor; limit: number },
  ) {
    const filter: Record<string, unknown> = {
      childUserId,
      ...beforeCursor(opts.before),
    };
    if (opts.since)
      filter.createdAt = { ...(filter.createdAt as object), $gte: opts.since };
    return this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(opts.limit)
      .exec();
  }

  /** Declined authorizations for the activity feed (FR-043/070). */
  findDeclined(
    childUserId: Types.ObjectId,
    opts: { since?: Date; before?: Cursor; limit: number },
  ) {
    const filter: Record<string, unknown> = {
      childUserId,
      kind: 'authorization',
      outcome: 'declined',
      ...beforeCursor(opts.before),
    };
    if (opts.since) filter.createdAt = { $gte: opts.since };
    return this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(opts.limit)
      .exec();
  }

  /** Children with an approved card transaction on `riyadhDate` (counter reconciliation). */
  distinctChildrenOn(riyadhDate: string): Promise<Types.ObjectId[]> {
    return this.model
      .distinct('childUserId', { riyadhDate, outcome: 'approved' })
      .exec();
  }
}
