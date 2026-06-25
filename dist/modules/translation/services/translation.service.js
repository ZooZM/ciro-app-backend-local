"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TranslationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const google_translate_provider_1 = require("../providers/google-translate.provider");
const translation_config_1 = require("../translation.config");
let TranslationService = TranslationService_1 = class TranslationService {
    translateClient;
    config;
    configService;
    logger = new common_1.Logger(TranslationService_1.name);
    lastTranslatedText = new Map();
    lastTranslationAt = new Map();
    pendingText = new Map();
    pendingTimers = new Map();
    constructor(translateClient, config, configService) {
        this.translateClient = translateClient;
        this.config = config;
        this.configService = configService;
    }
    get parent() {
        const projectId = this.configService.get('GOOGLE_PROJECT_ID');
        return `projects/${projectId}/locations/global`;
    }
    isSameLanguage(sourceLanguage, targetLanguage) {
        return (sourceLanguage.split('-')[0].toLowerCase() ===
            targetLanguage.split('-')[0].toLowerCase());
    }
    async translate(text, targetLanguage, sourceLanguage) {
        if (sourceLanguage && this.isSameLanguage(sourceLanguage, targetLanguage)) {
            return { text, targetLanguage };
        }
        const [response] = await this.translateClient.translateText({
            parent: this.parent,
            contents: [text],
            mimeType: 'text/plain',
            targetLanguageCode: targetLanguage,
            ...(sourceLanguage ? { sourceLanguageCode: sourceLanguage } : {}),
        });
        const translatedText = response.translations?.[0]?.translatedText ?? text;
        return { text: translatedText, targetLanguage };
    }
    async translateFinal(key, text, targetLanguage, sourceLanguage) {
        this.clearPending(key);
        this.lastTranslatedText.set(key, text);
        this.lastTranslationAt.set(key, Date.now());
        return this.translate(text, targetLanguage, sourceLanguage);
    }
    scheduleInterimTranslation(key, text, targetLanguage, sourceLanguage, onResult) {
        if (this.lastTranslatedText.get(key) === text) {
            return;
        }
        this.pendingText.set(key, text);
        const minIntervalMs = 1000 / this.config.interimRatePerSec;
        const elapsed = Date.now() - (this.lastTranslationAt.get(key) ?? 0);
        if (elapsed >= minIntervalMs) {
            this.runInterimTranslation(key, targetLanguage, sourceLanguage, onResult);
            return;
        }
        if (this.pendingTimers.has(key)) {
            return;
        }
        const timer = setTimeout(() => {
            this.runInterimTranslation(key, targetLanguage, sourceLanguage, onResult);
        }, minIntervalMs - elapsed);
        this.pendingTimers.set(key, timer);
    }
    runInterimTranslation(key, targetLanguage, sourceLanguage, onResult) {
        this.pendingTimers.delete(key);
        const latestText = this.pendingText.get(key);
        if (latestText === undefined)
            return;
        this.lastTranslatedText.set(key, latestText);
        this.lastTranslationAt.set(key, Date.now());
        this.translate(latestText, targetLanguage, sourceLanguage)
            .then(onResult)
            .catch((error) => {
            this.logger.error(`Interim translation failed for ${key}: ${error.message}`);
        });
    }
    clearPending(key) {
        const timer = this.pendingTimers.get(key);
        if (timer)
            clearTimeout(timer);
        this.pendingTimers.delete(key);
        this.pendingText.delete(key);
        this.lastTranslatedText.delete(key);
        this.lastTranslationAt.delete(key);
    }
};
exports.TranslationService = TranslationService;
exports.TranslationService = TranslationService = TranslationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(google_translate_provider_1.GOOGLE_TRANSLATE_CLIENT)),
    __param(1, (0, common_1.Inject)(translation_config_1.TRANSLATION_CONFIG)),
    __metadata("design:paramtypes", [Function, Object, config_1.ConfigService])
], TranslationService);
//# sourceMappingURL=translation.service.js.map