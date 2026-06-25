import { ConfigService } from '@nestjs/config';
export interface TranslationConfig {
    idleGraceMs: number;
    interimRatePerSec: number;
    lowBalanceSeconds: number;
    activationMinSeconds: number;
    sttRotationLeadMs: number;
    sttRotationOverlapMs: number;
    primaryLanguage: string;
    candidateLanguages: string[];
    workerRole: string;
}
export declare const TRANSLATION_CONFIG_DEFAULTS: {
    readonly IDLE_GRACE_MS: 10000;
    readonly INTERIM_RATE_PER_SEC: 2;
    readonly LOW_BALANCE_SECONDS: 30;
    readonly ACTIVATION_MIN_SECONDS: 1;
    readonly STT_ROTATION_LEAD_MS: 280000;
    readonly STT_ROTATION_OVERLAP_MS: 1500;
    readonly PRIMARY_LANGUAGE: "en-US";
    readonly CANDIDATE_LANGUAGES: readonly ["ar-SA", "fr-FR", "es-ES"];
    readonly WORKER_ROLE: "translation-worker";
};
export declare const TRANSLATION_CONFIG = "TRANSLATION_CONFIG";
export declare function translationConfigFactory(configService: ConfigService): TranslationConfig;
