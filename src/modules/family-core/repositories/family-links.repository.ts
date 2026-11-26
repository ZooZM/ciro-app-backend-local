import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  FamilyLink,
  FamilyLinkDocument,
  UnlinkReason,
} from '../schemas/family-link.schema';
import { oid } from '../pagination';

@Injectable()
export class FamilyLinksRepository extends BaseRepository<FamilyLinkDocument> {
  constructor(@InjectModel(FamilyLink.name) model: Model<FamilyLinkDocument>) {
    super(model);
  }

  findById(id: string | Types.ObjectId, session?: ClientSession) {
    return this.model
      .findById(oid(id))
      .session(session ?? null)
      .exec();
  }

  findActiveByChild(
    childUserId: string | Types.ObjectId,
    session?: ClientSession,
  ) {
    return this.model
      .findOne({ childUserId: oid(childUserId), status: 'active' })
      .session(session ?? null)
      .exec();
  }

  findActiveByParentAndChild(
    parentUserId: string | Types.ObjectId,
    childUserId: string | Types.ObjectId,
    session?: ClientSession,
  ) {
    return this.model
      .findOne({
        parentUserId: oid(parentUserId),
        childUserId: oid(childUserId),
        status: 'active',
      })
      .session(session ?? null)
      .exec();
  }

  findActiveByParent(
    parentUserId: string | Types.ObjectId,
    session?: ClientSession,
  ) {
    return this.model
      .find({ parentUserId: oid(parentUserId), status: 'active' })
      .sort({ createdAt: 1 })
      .session(session ?? null)
      .exec();
  }

  countActiveByParent(
    parentUserId: string | Types.ObjectId,
    session?: ClientSession,
  ) {
    return this.model
      .countDocuments({ parentUserId: oid(parentUserId), status: 'active' })
      .session(session ?? null)
      .exec();
  }

  findAllActive(
    opts: { childIds?: Types.ObjectId[]; parentIds?: Types.ObjectId[] } = {},
  ) {
    const filter: Record<string, unknown> = { status: 'active' };
    if (opts.childIds) filter.childUserId = { $in: opts.childIds };
    if (opts.parentIds) filter.parentUserId = { $in: opts.parentIds };
    return this.model.find(filter).exec();
  }

  async insert(data: Partial<FamilyLink>, session: ClientSession) {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /** Increments the child's monotonic `rev` and returns the new value. */
  async bumpRev(
    linkId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: linkId },
        { $inc: { rev: 1 } },
        { returnDocument: 'after', session, projection: { rev: 1 } },
      )
      .exec();
    return doc?.rev ?? 0;
  }

  /** `active → unlinked`; returns null when the link was not active. */
  markUnlinked(
    linkId: Types.ObjectId,
    reason: UnlinkReason,
    session: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: linkId, status: 'active' },
        {
          $set: {
            status: 'unlinked',
            unlinkedAt: new Date(),
            unlinkReason: reason,
          },
          $inc: { rev: 1 },
        },
        { returnDocument: 'after', session },
      )
      .exec();
  }
}
