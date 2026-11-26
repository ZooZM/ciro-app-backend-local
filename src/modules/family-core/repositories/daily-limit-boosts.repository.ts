import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  DailyLimitBoost,
  DailyLimitBoostDocument,
} from '../schemas/daily-limit-boost.schema';

@Injectable()
export class DailyLimitBoostsRepository extends BaseRepository<DailyLimitBoostDocument> {
  constructor(
    @InjectModel(DailyLimitBoost.name) model: Model<DailyLimitBoostDocument>,
  ) {
    super(model);
  }

  async amountFor(
    childUserId: Types.ObjectId,
    riyadhDate: string,
    session?: ClientSession,
  ): Promise<number> {
    const doc = await this.model
      .findOne({ childUserId, riyadhDate })
      .session(session ?? null)
      .exec();
    return doc?.amountHalalas ?? 0;
  }

  /** FR-055: today's boost grows by each approval made today. */
  async addBoost(
    childUserId: Types.ObjectId,
    riyadhDate: string,
    amountHalalas: number,
    requestId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    await this.model
      .updateOne(
        { childUserId, riyadhDate },
        { $inc: { amountHalalas }, $push: { requestIds: requestId } },
        { upsert: true, session },
      )
      .exec();
  }
}
