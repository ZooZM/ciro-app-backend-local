import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  AllowanceRequest,
  AllowanceRequestDocument,
} from '../schemas/allowance-request.schema';
import { RequestStatus } from '../family-core.constants';
import { beforeCursor, Cursor, oid } from '../pagination';

@Injectable()
export class AllowanceRequestsRepository extends BaseRepository<AllowanceRequestDocument> {
  constructor(
    @InjectModel(AllowanceRequest.name) model: Model<AllowanceRequestDocument>,
  ) {
    super(model);
  }

  findById(id: string | Types.ObjectId, session?: ClientSession) {
    if (typeof id === 'string' && !Types.ObjectId.isValid(id))
      return Promise.resolve(null);
    return this.model
      .findById(oid(id))
      .session(session ?? null)
      .exec();
  }

  findPendingByChild(childUserId: Types.ObjectId, session?: ClientSession) {
    return this.model
      .findOne({ childUserId, status: 'pending' })
      .session(session ?? null)
      .exec();
  }

  findPendingByLink(linkId: Types.ObjectId, session?: ClientSession) {
    return this.model
      .findOne({ linkId, status: 'pending' })
      .session(session ?? null)
      .exec();
  }

  async insert(data: Partial<AllowanceRequest>, session?: ClientSession) {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /** `pending → <status>`; exactly one writer wins, others get null. */
  transition(
    id: Types.ObjectId,
    set: Partial<AllowanceRequest> & { status: RequestStatus },
    session?: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: id, status: 'pending' },
        { $set: { resolvedAt: new Date(), ...set } },
        { returnDocument: 'after', session },
      )
      .exec();
  }

  listForChild(
    childUserId: Types.ObjectId,
    opts: { before?: Cursor; limit: number },
  ) {
    return this.model
      .find({ childUserId, ...beforeCursor(opts.before) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(opts.limit)
      .exec();
  }

  listForParent(
    parentUserId: Types.ObjectId,
    opts: {
      status?: 'pending' | 'resolved';
      childIds?: Types.ObjectId[];
      before?: Cursor;
      limit: number;
    },
  ) {
    const filter: Record<string, unknown> = {
      parentUserId,
      ...beforeCursor(opts.before),
    };
    if (opts.status === 'pending') filter.status = 'pending';
    if (opts.status === 'resolved') filter.status = { $ne: 'pending' };
    if (opts.childIds) filter.childUserId = { $in: opts.childIds };
    return this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(opts.limit)
      .exec();
  }

  findLastResolvedSince(
    childUserId: Types.ObjectId,
    linkId: Types.ObjectId,
    since: Date,
  ) {
    return this.model
      .findOne({
        childUserId,
        linkId,
        status: { $ne: 'pending' },
        resolvedAt: { $gte: since },
      })
      .sort({ resolvedAt: -1 })
      .exec();
  }

  findOverdue(asOf: Date, childIds?: Types.ObjectId[]) {
    const filter: Record<string, unknown> = {
      status: 'pending',
      expiresAt: { $lte: asOf },
    };
    if (childIds) filter.childUserId = { $in: childIds };
    return this.model.find(filter).exec();
  }

  findResolvedForActivity(
    childUserId: Types.ObjectId,
    opts: { since?: Date; before?: Cursor; limit: number },
  ) {
    const filter: Record<string, unknown> = {
      childUserId,
      status: { $in: ['declined', 'expired', 'cancelled'] },
      ...beforeCursor(opts.before, 'resolvedAt'),
    };
    if (opts.since)
      filter.resolvedAt = {
        ...(filter.resolvedAt as object),
        $gte: opts.since,
      };
    return this.model
      .find(filter)
      .sort({ resolvedAt: -1, _id: -1 })
      .limit(opts.limit)
      .exec();
  }

  findByIds(ids: Types.ObjectId[]) {
    return this.model.find({ _id: { $in: ids } }).exec();
  }

  countPendingByChildren(childUserIds: Types.ObjectId[]) {
    return this.model
      .find(
        { childUserId: { $in: childUserIds }, status: 'pending' },
        { childUserId: 1 },
      )
      .exec();
  }
}
