import { TranslationStateService } from './translation-state.service';
import { UsersRepository } from '../../users/users.repository';
import { TranslationUsageRepository } from '../repositories/translation-usage.repository';
import { TranslationUsageEndReason } from '../schemas/translation-usage.schema';
import type { TranslationConfig } from '../translation.config';
export interface BillingSessionParams {
    listenerId: string;
    roomId: string;
    speakerId: string;
    targetLanguage: string;
    initialBalanceSeconds: number;
}
export interface BillingTickerCallbacks {
    onCreditsLow: (remainingSeconds: number) => void;
    onExhausted: () => void;
}
export declare class BillingTickerService {
    private readonly translationStateService;
    private readonly usersRepository;
    private readonly translationUsageRepository;
    private readonly config;
    private readonly logger;
    private readonly sessions;
    private readonly startingKeys;
    constructor(translationStateService: TranslationStateService, usersRepository: UsersRepository, translationUsageRepository: TranslationUsageRepository, config: TranslationConfig);
    private key;
    hasSession(roomId: string, speakerId: string, listenerId: string): boolean;
    updateTargetLanguage(roomId: string, speakerId: string, listenerId: string, targetLanguage: string): void;
    recordCaption(roomId: string, speakerId: string, listenerId: string, type: 'interim' | 'final', sourceLanguage: string): void;
    start(params: BillingSessionParams, callbacks: BillingTickerCallbacks): Promise<void>;
    private tick;
    private flush;
    private exhaust;
    stop(roomId: string, speakerId: string, listenerId: string, endReason: TranslationUsageEndReason): Promise<void>;
}
