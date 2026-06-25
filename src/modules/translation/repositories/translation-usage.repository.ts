import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  TranslationUsage,
  TranslationUsageDocument,
  TranslationUsageEndReason,
} from '../schemas/translation-usage.schema';

export interface StartSessionInput {
  listenerId: string;
  roomId: string;
  speakerId: string;
  targetLanguage: string;
}

export interface FlushConsumptionInput {
  /** Absolute total seconds consumed so far (authoritative, not a delta). */
  secondsConsumed: number;
  interimDelta?: number;
  finalDelta?: number;
  detectedSourceLanguage?: string;
}

@Injectable()
export class TranslationUsageRepository extends BaseRepository<TranslationUsageDocument> {
  constructor(
    @InjectModel(TranslationUsage.name)
    private readonly translationUsageModel: Model<TranslationUsageDocument>,
  ) {
    super(translationUsageModel);
  }

  /** Creates the audit record for a newly opened listener session. */
  async startSession(
    input: StartSessionInput,
  ): Promise<TranslationUsageDocument> {
    return this.create({
      listenerId: new Types.ObjectId(input.listenerId),
      roomId: input.roomId,
      speakerId: input.speakerId,
      targetLanguage: input.targetLanguage,
      detectedSourceLanguages: [],
      secondsConsumed: 0,
      interimCount: 0,
      finalCount: 0,
      startedAt: new Date(),
    });
  }

  /**
   * Periodic / final atomic flush of consumption (FR-026, SC-013).
   * `secondsConsumed` is written as an absolute value (the billing ticker
   * already tracks the running total); counts are incremented.
   */
  async flushConsumption(
    sessionId: string,
    input: FlushConsumptionInput,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      $set: { secondsConsumed: input.secondsConsumed },
    };
    const inc: Record<string, number> = {};
    if (input.interimDelta) inc.interimCount = input.interimDelta;
    if (input.finalDelta) inc.finalCount = input.finalDelta;
    if (Object.keys(inc).length > 0) update.$inc = inc;
    if (input.detectedSourceLanguage) {
      update.$addToSet = {
        detectedSourceLanguages: input.detectedSourceLanguage,
      };
    }

    await this.updateOne({ _id: new Types.ObjectId(sessionId) }, update);
  }

  /** Marks the session ended (no further billing after this point — FR-026). */
  async finalizeSession(
    sessionId: string,
    endReason: TranslationUsageEndReason,
    secondsConsumed: number,
  ): Promise<void> {
    await this.updateOne(
      { _id: new Types.ObjectId(sessionId) },
      { $set: { endedAt: new Date(), endReason, secondsConsumed } },
    );
  }

  /** Sessions not yet finalized for a listener (`GET /translation/sessions/active`, contracts/rest-endpoints.md). */
  async findActiveSessions(
    listenerId: string,
  ): Promise<
    Pick<
      TranslationUsage,
      | 'roomId'
      | 'speakerId'
      | 'targetLanguage'
      | 'startedAt'
      | 'secondsConsumed'
    >[]
  > {
    return this.translationUsageModel
      .find({
        listenerId: new Types.ObjectId(listenerId),
        endedAt: { $exists: false },
      })
      .select('roomId speakerId targetLanguage startedAt secondsConsumed')
      .lean()
      .exec();
  }
}
