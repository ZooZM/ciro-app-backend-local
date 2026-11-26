import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  AllowanceSettings,
  AllowanceSettingsDocument,
} from '../schemas/allowance-settings.schema';
import { oid } from '../pagination';

@Injectable()
export class AllowanceSettingsRepository extends BaseRepository<AllowanceSettingsDocument> {
  constructor(
    @InjectModel(AllowanceSettings.name)
    model: Model<AllowanceSettingsDocument>,
  ) {
    super(model);
  }

  findByLinkId(linkId: string | Types.ObjectId, session?: ClientSession) {
    return this.model
      .findOne({ linkId: oid(linkId) })
      .session(session ?? null)
      .exec();
  }

  findByLinkIds(linkIds: Types.ObjectId[]) {
    return this.model.find({ linkId: { $in: linkIds } }).exec();
  }

  async insert(data: Partial<AllowanceSettings>, session: ClientSession) {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  update(
    linkId: Types.ObjectId,
    set: Partial<AllowanceSettings>,
    session: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { linkId },
        { $set: set },
        { returnDocument: 'after', session, runValidators: true },
      )
      .exec();
  }
}
