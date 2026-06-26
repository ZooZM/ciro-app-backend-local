"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSLATION_CONFIG = exports.TRANSLATION_CONFIG_DEFAULTS = void 0;
exports.translationConfigFactory = translationConfigFactory;
exports.TRANSLATION_CONFIG_DEFAULTS = {
    IDLE_GRACE_MS: 10_000,
    INTERIM_RATE_PER_SEC: 2,
    LOW_BALANCE_SECONDS: 30,
    ACTIVATION_MIN_SECONDS: 1,
    STT_ROTATION_LEAD_MS: 280_000,
    STT_ROTATION_OVERLAP_MS: 1_500,
    PRIMARY_LANGUAGE: 'en-US',
    CANDIDATE_LANGUAGES: ['ar-SA', 'fr-FR', 'es-ES'],
    WORKER_ROLE: 'translation-worker',
};
exports.TRANSLATION_CONFIG = 'TRANSLATION_CONFIG';
function translationConfigFactory(configService) {
    const candidateLanguagesRaw = configService.get('TRANSLATION_CANDIDATE_LANGUAGES');
    return {
        idleGraceMs: configService.get('TRANSLATION_IDLE_GRACE_MS', exports.TRANSLATION_CONFIG_DEFAULTS.IDLE_GRACE_MS),
        interimRatePerSec: configService.get('TRANSLATION_INTERIM_RATE_PER_SEC', exports.TRANSLATION_CONFIG_DEFAULTS.INTERIM_RATE_PER_SEC),
        lowBalanceSeconds: configService.get('TRANSLATION_LOW_BALANCE_SECONDS', exports.TRANSLATION_CONFIG_DEFAULTS.LOW_BALANCE_SECONDS),
        activationMinSeconds: configService.get('TRANSLATION_ACTIVATION_MIN_SECONDS', exports.TRANSLATION_CONFIG_DEFAULTS.ACTIVATION_MIN_SECONDS),
        sttRotationLeadMs: exports.TRANSLATION_CONFIG_DEFAULTS.STT_ROTATION_LEAD_MS,
        sttRotationOverlapMs: exports.TRANSLATION_CONFIG_DEFAULTS.STT_ROTATION_OVERLAP_MS,
        primaryLanguage: configService.get('TRANSLATION_PRIMARY_LANGUAGE', exports.TRANSLATION_CONFIG_DEFAULTS.PRIMARY_LANGUAGE),
        candidateLanguages: candidateLanguagesRaw
            ? candidateLanguagesRaw
                .split(',')
                .map((code) => code.trim())
                .filter(Boolean)
            : [...exports.TRANSLATION_CONFIG_DEFAULTS.CANDIDATE_LANGUAGES],
        workerRole: configService.get('TRANSLATION_WORKER_ROLE', exports.TRANSLATION_CONFIG_DEFAULTS.WORKER_ROLE),
    };
}
//# sourceMappingURL=translation.config.js.map