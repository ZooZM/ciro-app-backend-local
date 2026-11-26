import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  AllowancePayout,
  AllowancePayoutDocument,
} from '../schemas/allowance-payout.schema';
import { beforeCursor, Cursor, oid } from '../pagination';

@Injectable()
export class AllowancePayoutsRepository extends BaseRepository<AllowancePayoutDocument> {
  constructor(
    @InjectModel(AllowancePayout.name) model: Model<AllowancePayoutDocument>,
  ) {
    super(model);
  }

  findById(id: string | Types.ObjectId, session?: ClientSession) {
    return this.model
      .findById(oid(id))
      .session(session ?? null)
      .exec();
  }

  findByChildAndMonth(
    childUserId: Types.ObjectId,
    month: string,
    session?: ClientSession,
  ) {
    return this.model
      .findOne({ childUserId, month })
      .session(session ?? null)
      .exec();
  }

  findMonthsForChildren(childUserIds: Types.ObjectId[], month: string) {
    return this.model
      .find({ childUserId: { $in: childUserIds }, month })
      .exec();
  }

  async insert(data: Partial<AllowancePayout>, session?: ClientSession) {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /** `failed → paid_late`; returns null when it is no longer `failed`. */
  markPaidLate(
    id: Types.ObjectId,
    ledgerEntryId: Types.ObjectId,
    session: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: 'failed' },
        { $set: { status: 'paid_late', ledgerEntryId, paidAt: new Date() } },
        { returnDocument: 'after', session },
      )
      .exec();
  }

  findLatestFailed(childUserId: Types.ObjectId, linkId: Types.ObjectId) {
    return this.model
      .findOne({ childUserId, linkId, status: 'failed' })
      .sort({ month: -1 })
      .exec();
  }

  findFailedForActivity(
    childUserId: Types.ObjectId,
    opts: { since?: Date; before?: Cursor; limit: number },
  ) {
    const filter: Record<string, unknown> = {
      childUserId,
      failedAt: { $exists: true },
      ...beforeCursor(opts.before, 'failedAt'),
    };
    if (opts.since)
      filter.failedAt = { ...(filter.failedAt as object), $gte: opts.since };
    return this.model
      .find(filter)
      .sort({ failedAt: -1, _id: -1 })
      .limit(opts.limit)
      .exec();
  }
}
