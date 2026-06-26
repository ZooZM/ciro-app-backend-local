import { ConfigService } from '@nestjs/config';

/**
 * Strongly-typed runtime configuration for the translation feature.
 * Built from the Joi-validated env vars (see AppModule) — never read
 * `process.env` directly (Constitution IV).
 */
export interface TranslationConfig {
  /** Idle grace window before a pipeline with zero subscribers tears down (FR-009). */
  idleGraceMs: number;
  /** Max interim translations per (speaker, targetLanguage) per second (FR-005a). */
  interimRatePerSec: number;
  /** Remaining-seconds threshold that triggers a one-time `credits_low` event (FR-024a). */
  lowBalanceSeconds: number;
  /** Minimum balance (seconds) required to open a new translation session (FR-021). */
  activationMinSeconds: number;
  /** How long before Google's ~5-min streaming limit to start rotating to a new stream. */
  sttRotationLeadMs: number;
  /** How long the old and new STT streams both receive audio during rotation. */
  sttRotationOverlapMs: number;
  /** Default/fallback primary language for STT when no per-speaker cache exists. */
  primaryLanguage: string;
  /** Alternative language codes offered to STT for auto-detection. */
  candidateLanguages: string[];
  /** v1 pinned-worker role identifier for this instance (T015a). */
  workerRole: string;
}

export const TRANSLATION_CONFIG_DEFAULTS = {
  IDLE_GRACE_MS: 10_000,
  INTERIM_RATE_PER_SEC: 2,
  LOW_BALANCE_SECONDS: 30,
  ACTIVATION_MIN_SECONDS: 1,
  STT_ROTATION_LEAD_MS: 280_000,
  STT_ROTATION_OVERLAP_MS: 1_500,
  PRIMARY_LANGUAGE: 'en-US',
  CANDIDATE_LANGUAGES: ['ar-SA', 'fr-FR', 'es-ES'],
  WORKER_ROLE: 'translation-worker',
} as const;

/** DI token for the resolved {@link TranslationConfig}. */
export const TRANSLATION_CONFIG = 'TRANSLATION_CONFIG';

/** Builds {@link TranslationConfig} from `ConfigService` (used by translation.module.ts). */
export function translationConfigFactory(
  configService: ConfigService,
): TranslationConfig {
  const candidateLanguagesRaw = configService.get<string>(
    'TRANSLATION_CANDIDATE_LANGUAGES',
  );

  return {
    idleGraceMs: configService.get<number>(
      'TRANSLATION_IDLE_GRACE_MS',
      TRANSLATION_CONFIG_DEFAULTS.IDLE_GRACE_MS,
    ),
    interimRatePerSec: configService.get<number>(
      'TRANSLATION_INTERIM_RATE_PER_SEC',
      TRANSLATION_CONFIG_DEFAULTS.INTERIM_RATE_PER_SEC,
    ),
    lowBalanceSeconds: configService.get<number>(
      'TRANSLATION_LOW_BALANCE_SECONDS',
      TRANSLATION_CONFIG_DEFAULTS.LOW_BALANCE_SECONDS,
    ),
    activationMinSeconds: configService.get<number>(
      'TRANSLATION_ACTIVATION_MIN_SECONDS',
      TRANSLATION_CONFIG_DEFAULTS.ACTIVATION_MIN_SECONDS,
    ),
    sttRotationLeadMs: TRANSLATION_CONFIG_DEFAULTS.STT_ROTATION_LEAD_MS,
    sttRotationOverlapMs: TRANSLATION_CONFIG_DEFAULTS.STT_ROTATION_OVERLAP_MS,
    primaryLanguage: configService.get<string>(
      'TRANSLATION_PRIMARY_LANGUAGE',
      TRANSLATION_CONFIG_DEFAULTS.PRIMARY_LANGUAGE,
    ),
    candidateLanguages: candidateLanguagesRaw
      ? candidateLanguagesRaw
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean)
      : [...TRANSLATION_CONFIG_DEFAULTS.CANDIDATE_LANGUAGES],
    workerRole: configService.get<string>(
      'TRANSLATION_WORKER_ROLE',
      TRANSLATION_CONFIG_DEFAULTS.WORKER_ROLE,
    ),
  };
}
