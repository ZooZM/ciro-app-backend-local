import { ConfigService } from '@nestjs/config';
import type { v3 } from '@google-cloud/translate';
import type { TranslationConfig } from '../translation.config';
export interface TranslationResult {
    text: string;
    targetLanguage: string;
}
export declare class TranslationService {
    private readonly translateClient;
    private readonly config;
    private readonly configService;
    private readonly logger;
    private readonly lastTranslatedText;
    private readonly lastTranslationAt;
    private readonly pendingText;
    private readonly pendingTimers;
    constructor(translateClient: v3.TranslationServiceClient, config: TranslationConfig, configService: ConfigService);
    private get parent();
    private isSameLanguage;
    translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult>;
    translateFinal(key: string, text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult>;
    scheduleInterimTranslation(key: string, text: string, targetLanguage: string, sourceLanguage: string | undefined, onResult: (result: TranslationResult) => void): void;
    private runInterimTranslation;
    clearPending(key: string): void;
}
