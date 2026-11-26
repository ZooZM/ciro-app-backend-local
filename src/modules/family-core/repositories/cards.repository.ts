import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { Card, CardDocument } from '../schemas/card.schema';
import { CardStatus } from '../family-core.constants';
import { oid } from '../pagination';

@Injectable()
export class CardsRepository extends BaseRepository<CardDocument> {
  constructor(@InjectModel(Card.name) model: Model<CardDocument>) {
    super(model);
  }

  findById(id: string | Types.ObjectId, session?: ClientSession) {
    return this.model
      .findById(oid(id))
      .session(session ?? null)
      .exec();
  }

  findByLinkId(linkId: string | Types.ObjectId, session?: ClientSession) {
    return this.model
      .findOne({ linkId: oid(linkId) })
      .sort({ createdAt: -1 })
      .session(session ?? null)
      .exec();
  }

  findByRef(provider: string, cardRef: string, session?: ClientSession) {
    return this.model
      .findOne({ provider, cardRef })
      .session(session ?? null)
      .exec();
  }

  async insert(data: Partial<Card>, session: ClientSession) {
    const [doc] = await this.model.create([data], { session });
    return doc;
  }

  /** Moves the card from one of `from` to `to`; returns null when it was in another state. */
  setStatus(
    cardId: Types.ObjectId,
    from: CardStatus[],
    to: CardStatus,
    by: Types.ObjectId | undefined,
    session?: ClientSession,
  ) {
    return this.model
      .findOneAndUpdate(
        { _id: cardId, status: { $in: from } },
        {
          $set: {
            status: to,
            statusChangedAt: new Date(),
            statusChangedBy: by,
          },
        },
        { returnDocument: 'after', session },
      )
      .exec();
  }
}
