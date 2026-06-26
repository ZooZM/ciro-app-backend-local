import { UsersRepository } from '../../users/users.repository';
import { TranslationStateService } from './translation-state.service';
import { TranslationService } from './translation.service';
import { CaptionDispatchService } from './caption-dispatch.service';
import { SpeakerLanguageCache } from './language-detection.util';
import type { TranslationConfig } from '../translation.config';
import { TranslationUsageEndReason } from '../schemas/translation-usage.schema';
import { BillingTickerService } from './billing-ticker.service';
import { SpeechPipelineService, type PipelineFailureReason } from './speech-pipeline.service';
export type SubscribeDeniedReason = 'unsupported_language' | 'insufficient_credits';
export interface TranslationUnavailableEvent {
    roomId: string;
    speakerId: string;
    reason: PipelineFailureReason;
    transient: boolean;
}
export interface CreditsLowEvent {
    roomId: string;
    speakerId: string;
    remainingSeconds: number;
    thresholdSeconds: number;
}
export interface CreditsExhaustedEvent {
    roomId: string;
    speakerId: string;
    remainingSeconds: 0;
    action: 'branch_closed';
}
export type SubscribeResult = {
    status: 'subscribed';
    targetLanguage: string;
    remainingSeconds: number;
} | {
    status: 'denied';
    reason: SubscribeDeniedReason;
} | {
    status: 'unavailable';
    reason: PipelineFailureReason;
    transient: boolean;
};
export interface TranslationManagerEventHandler {
    onTranslationUnavailable(listenerId: string, event: TranslationUnavailableEvent): void;
    onCreditsLow(listenerId: string, event: CreditsLowEvent): void;
    onCreditsExhausted(listenerId: string, event: CreditsExhaustedEvent): void;
}
export declare class TranslationManagerService {
    private readonly speechPipelineService;
    private readonly translationStateService;
    private readonly translationService;
    private readonly captionDispatchService;
    private readonly speakerLanguageCache;
    private readonly usersRepository;
    private readonly billingTickerService;
    private readonly config;
    private readonly logger;
    private readonly instanceId;
    private readonly pipelines;
    private readonly pipelineOpens;
    private eventHandler?;
    constructor(speechPipelineService: SpeechPipelineService, translationStateService: TranslationStateService, translationService: TranslationService, captionDispatchService: CaptionDispatchService, speakerLanguageCache: SpeakerLanguageCache, usersRepository: UsersRepository, billingTickerService: BillingTickerService, config: TranslationConfig);
    setEventHandler(handler: TranslationManagerEventHandler): void;
    private pipelineKey;
    private translationKey;
    subscribe(roomId: string, speakerId: string, listenerId: string, targetLanguage: string): Promise<SubscribeResult>;
    private handleCreditsExhausted;
    unsubscribe(roomId: string, speakerId: string, listenerId: string, endReason?: TranslationUsageEndReason): Promise<void>;
    private removeListenerFromPipeline;
    private dropTargetIfEmpty;
    private scheduleTeardown;
    private completeTeardownIfIdle;
    private getOrOpenPipeline;
    private openPipeline;
    private addListenerToTarget;
    private handleTranscript;
    private dispatchCaption;
    private handlePipelineError;
    private teardownPipeline;
}
