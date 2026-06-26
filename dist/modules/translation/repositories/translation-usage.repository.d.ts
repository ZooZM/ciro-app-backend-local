import { Model } from 'mongoose';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { TranslationUsage, TranslationUsageDocument, TranslationUsageEndReason } from '../schemas/translation-usage.schema';
export interface StartSessionInput {
    listenerId: string;
    roomId: string;
    speakerId: string;
    targetLanguage: string;
}
export interface FlushConsumptionInput {
    secondsConsumed: number;
    interimDelta?: number;
    finalDelta?: number;
    detectedSourceLanguage?: string;
}
export declare class TranslationUsageRepository extends BaseRepository<TranslationUsageDocument> {
    private readonly translationUsageModel;
    constructor(translationUsageModel: Model<TranslationUsageDocument>);
    startSession(input: StartSessionInput): Promise<TranslationUsageDocument>;
    flushConsumption(sessionId: string, input: FlushConsumptionInput): Promise<void>;
    finalizeSession(sessionId: string, endReason: TranslationUsageEndReason, secondsConsumed: number): Promise<void>;
    findActiveSessions(listenerId: string): Promise<Pick<TranslationUsage, 'roomId' | 'speakerId' | 'targetLanguage' | 'startedAt' | 'secondsConsumed'>[]>;
}
