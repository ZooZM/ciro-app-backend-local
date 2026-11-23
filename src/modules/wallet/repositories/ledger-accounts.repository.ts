import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  LedgerAccount,
  LedgerAccountDocument,
  LedgerAccountKind,
  SystemAccountCode,
} from '../schemas/ledger-account.schema';

const DUPLICATE_KEY = 11000;

function oid(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

@Injectable()
export class LedgerAccountsRepository extends BaseRepository<LedgerAccountDocument> {
  constructor(
    @InjectModel(LedgerAccount.name)
    model: Model<LedgerAccountDocument>,
  ) {
    super(model);
  }

  findById(
    id: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument | null> {
    return this.model
      .findById(oid(id))
      .session(session ?? null)
      .exec();
  }

  findByIds(
    ids: (string | Types.ObjectId)[],
    session?: ClientSession,
  ): Promise<LedgerAccountDocument[]> {
    return this.model
      .find({ _id: { $in: ids.map(oid) } })
      .session(session ?? null)
      .exec();
  }

  findOwned(
    kind: Exclude<LedgerAccountKind, 'system'>,
    ownerUserId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument | null> {
    return this.model
      .findOne({ kind, ownerUserId: oid(ownerUserId) })
      .session(session ?? null)
      .exec();
  }

  /** Creates the owned account if missing. Safe under concurrent callers. */
  async upsertOwned(
    kind: Exclude<LedgerAccountKind, 'system'>,
    ownerUserId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument> {
    const filter = { kind, ownerUserId: oid(ownerUserId) };
    try {
      const doc = await this.model
        .findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...filter,
              currency: 'SAR',
              balanceHalalas: 0,
              allowNegative: false,
              frozen: false,
            },
          },
          { upsert: true, returnDocument: 'after', session },
        )
        .exec();
      return doc;
    } catch (err) {
      if ((err as { code?: number }).code !== DUPLICATE_KEY || session)
        throw err;
      return (await this.model.findOne(filter).exec())!;
    }
  }

  async upsertSystem(
    code: SystemAccountCode,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument> {
    const filter = { kind: 'system' as const, systemCode: code };
    try {
      const doc = await this.model
        .findOneAndUpdate(
          filter,
          {
            $setOnInsert: {
              ...filter,
              currency: 'SAR',
              balanceHalalas: 0,
              allowNegative: true,
              frozen: false,
            },
          },
          { upsert: true, returnDocument: 'after', session },
        )
        .exec();
      return doc;
    } catch (err) {
      if ((err as { code?: number }).code !== DUPLICATE_KEY || session)
        throw err;
      return (await this.model.findOne(filter).exec())!;
    }
  }

  /**
   * Guarded debit: succeeds only if the account is not frozen and, unless
   * `allowNegative`, holds at least `amount`. Returns false when the guard
   * did not match (research R2/R3).
   */
  async debit(
    accountId: Types.ObjectId,
    amount: number,
    allowNegative: boolean,
    session: ClientSession,
  ): Promise<boolean> {
    const filter: Record<string, unknown> = { _id: accountId, frozen: false };
    if (!allowNegative) filter.balanceHalalas = { $gte: amount };
    const res = await this.model
      .updateOne(filter, { $inc: { balanceHalalas: -amount } }, { session })
      .exec();
    return res.modifiedCount === 1;
  }

  async credit(
    accountId: Types.ObjectId,
    amount: number,
    session: ClientSession,
  ): Promise<boolean> {
    const res = await this.model
      .updateOne(
        { _id: accountId, frozen: false },
        { $inc: { balanceHalalas: amount } },
        { session },
      )
      .exec();
    return res.modifiedCount === 1;
  }

  async setFrozen(
    accountId: Types.ObjectId,
    frozen: boolean,
    session?: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne({ _id: accountId }, { $set: { frozen } }, { session })
      .exec();
  }

  /** Streams every account for reconciliation (R15). */
  allCursor() {
    return this.model.find({}).lean().cursor();
  }
}
