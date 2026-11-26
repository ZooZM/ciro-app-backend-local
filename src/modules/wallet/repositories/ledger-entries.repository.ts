import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  EntryType,
  LedgerEntry,
  LedgerEntryDocument,
} from '../schemas/ledger-entry.schema';

export type NewLedgerEntry = Omit<LedgerEntry, 'createdAt' | 'currency'> & {
  currency?: 'SAR';
};

@Injectable()
export class LedgerEntriesRepository extends BaseRepository<LedgerEntryDocument> {
  constructor(
    @InjectModel(LedgerEntry.name)
    model: Model<LedgerEntryDocument>,
  ) {
    super(model);
  }

  async insert(
    entry: NewLedgerEntry,
    session: ClientSession,
  ): Promise<LedgerEntryDocument> {
    const [doc] = await this.model.create([{ currency: 'SAR', ...entry }], {
      session,
    });
    return doc;
  }

  findByIdempotencyKey(
    key: string,
    session?: ClientSession,
  ): Promise<LedgerEntryDocument | null> {
    return this.model
      .findOne({ idempotencyKey: key })
      .session(session ?? null)
      .exec();
  }

  findById(
    id: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerEntryDocument | null> {
    return this.model
      .findById(id)
      .session(session ?? null)
      .exec();
  }

  /** Entries that touch `accountId` on either side, newest first. */
  findForAccount(
    accountId: Types.ObjectId,
    opts: {
      types?: EntryType[];
      since?: Date;
      before?: { createdAt: Date; id: Types.ObjectId };
      fromDate?: string;
      toDate?: string;
      limit?: number;
    } = {},
    session?: ClientSession,
  ): Promise<LedgerEntryDocument[]> {
    const filter: Record<string, unknown> = {
      $or: [{ debitAccountId: accountId }, { creditAccountId: accountId }],
    };
    const and: Record<string, unknown>[] = [];
    if (opts.types) filter.type = { $in: opts.types };
    if (opts.since) and.push({ createdAt: { $gte: opts.since } });
    if (opts.fromDate || opts.toDate) {
      const range: Record<string, string> = {};
      if (opts.fromDate) range.$gte = opts.fromDate;
      if (opts.toDate) range.$lte = opts.toDate;
      filter.riyadhDate = range;
    }
    if (opts.before) {
      and.push({
        $or: [
          { createdAt: { $lt: opts.before.createdAt } },
          { createdAt: opts.before.createdAt, _id: { $lt: opts.before.id } },
        ],
      });
    }
    if (and.length) filter.$and = and;
    let query = this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .session(session ?? null);
    if (opts.limit) query = query.limit(opts.limit);
    return query.exec();
  }

  /** Σcredit − Σdebit per account (reconciliation, R15; invariant tests). */
  async derivedBalances(
    accountIds?: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    const side = (
      field: 'creditAccountId' | 'debitAccountId',
    ): PipelineStage[] => [
      ...(accountIds ? [{ $match: { [field]: { $in: accountIds } } }] : []),
      { $group: { _id: `$${field}`, total: { $sum: '$amountHalalas' } } },
    ];
    const [credits, debits] = await Promise.all([
      this.model.aggregate<{ _id: Types.ObjectId; total: number }>(
        side('creditAccountId'),
      ),
      this.model
        .aggregate<{
          _id: Types.ObjectId;
          total: number;
        }>(side('debitAccountId'))
        .then((rows) => rows.map((r) => ({ ...r, total: -r.total }))),
    ]);
    const result = new Map<string, number>();
    for (const row of [...credits, ...debits]) {
      const key = row._id.toString();
      result.set(key, (result.get(key) ?? 0) + row.total);
    }
    return result;
  }
}
