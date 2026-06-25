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
var BillingTickerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingTickerService = void 0;
const common_1 = require("@nestjs/common");
const translation_state_service_1 = require("./translation-state.service");
const users_repository_1 = require("../../users/users.repository");
const translation_usage_repository_1 = require("../repositories/translation-usage.repository");
const translation_usage_schema_1 = require("../schemas/translation-usage.schema");
const translation_config_1 = require("../translation.config");
const DB_FLUSH_INTERVAL_SECONDS = 15;
let BillingTickerService = BillingTickerService_1 = class BillingTickerService {
    translationStateService;
    usersRepository;
    translationUsageRepository;
    config;
    logger = new common_1.Logger(BillingTickerService_1.name);
    sessions = new Map();
    startingKeys = new Set();
    constructor(translationStateService, usersRepository, translationUsageRepository, config) {
        this.translationStateService = translationStateService;
        this.usersRepository = usersRepository;
        this.translationUsageRepository = translationUsageRepository;
        this.config = config;
    }
    key(roomId, speakerId, listenerId) {
        return `${roomId}:${speakerId}:${listenerId}`;
    }
    hasSession(roomId, speakerId, listenerId) {
        return this.sessions.has(this.key(roomId, speakerId, listenerId));
    }
    updateTargetLanguage(roomId, speakerId, listenerId, targetLanguage) {
        const session = this.sessions.get(this.key(roomId, speakerId, listenerId));
        if (session)
            session.targetLanguage = targetLanguage;
    }
    recordCaption(roomId, speakerId, listenerId, type, sourceLanguage) {
        const session = this.sessions.get(this.key(roomId, speakerId, listenerId));
        if (!session)
            return;
        if (type === 'interim')
            session.interimDelta += 1;
        else
            session.finalDelta += 1;
        session.detectedSourceLanguages.add(sourceLanguage);
    }
    async start(params, callbacks) {
        const key = this.key(params.roomId, params.speakerId, params.listenerId);
        if (this.sessions.has(key) || this.startingKeys.has(key))
            return;
        this.startingKeys.add(key);
        try {
            const usage = await this.translationUsageRepository.startSession({
                listenerId: params.listenerId,
                roomId: params.roomId,
                speakerId: params.speakerId,
                targetLanguage: params.targetLanguage,
            });
            const sessionId = usage._id.toString();
            await this.translationStateService.seedBalance(params.listenerId, sessionId, params.initialBalanceSeconds);
            await this.translationStateService.clearLowBalanceFlag(sessionId);
            const session = {
                sessionId,
                listenerId: params.listenerId,
                targetLanguage: params.targetLanguage,
                secondsConsumed: 0,
                lastFlushedSeconds: 0,
                interimDelta: 0,
                finalDelta: 0,
                detectedSourceLanguages: new Set(),
                callbacks,
                ticker: setInterval(() => void this.tick(key), 1000),
            };
            this.sessions.set(key, session);
        }
        finally {
            this.startingKeys.delete(key);
        }
    }
    async tick(key) {
        const session = this.sessions.get(key);
        if (!session)
            return;
        const remaining = await this.translationStateService.decrementBalance(session.listenerId, session.sessionId, 1);
        session.secondsConsumed += 1;
        if (remaining <= this.config.lowBalanceSeconds) {
            const firstTime = await this.translationStateService.markLowBalanceEmitted(session.sessionId);
            if (firstTime) {
                session.callbacks.onCreditsLow(remaining);
            }
        }
        if (session.secondsConsumed - session.lastFlushedSeconds >=
            DB_FLUSH_INTERVAL_SECONDS) {
            await this.flush(session);
        }
        if (remaining === 0) {
            await this.exhaust(key, session);
        }
    }
    async flush(session) {
        const delta = session.secondsConsumed - session.lastFlushedSeconds;
        if (delta <= 0)
            return;
        await this.usersRepository.decrementTranslationBalance(session.listenerId, delta);
        const [detectedSourceLanguage] = session.detectedSourceLanguages;
        await this.translationUsageRepository.flushConsumption(session.sessionId, {
            secondsConsumed: session.secondsConsumed,
            interimDelta: session.interimDelta || undefined,
            finalDelta: session.finalDelta || undefined,
            detectedSourceLanguage,
        });
        session.lastFlushedSeconds = session.secondsConsumed;
        session.interimDelta = 0;
        session.finalDelta = 0;
        session.detectedSourceLanguages.clear();
    }
    async exhaust(key, session) {
        clearInterval(session.ticker);
        this.sessions.delete(key);
        await this.flush(session);
        await this.translationUsageRepository.finalizeSession(session.sessionId, translation_usage_schema_1.TranslationUsageEndReason.CREDITS_EXHAUSTED, session.secondsConsumed);
        await this.translationStateService.deleteBalance(session.listenerId, session.sessionId);
        await this.translationStateService.clearLowBalanceFlag(session.sessionId);
        this.logger.log(`Translation credits exhausted for listener ${session.listenerId} (session ${session.sessionId})`);
        session.callbacks.onExhausted();
    }
    async stop(roomId, speakerId, listenerId, endReason) {
        const key = this.key(roomId, speakerId, listenerId);
        const session = this.sessions.get(key);
        if (!session)
            return;
        clearInterval(session.ticker);
        this.sessions.delete(key);
        await this.flush(session);
        await this.translationUsageRepository.finalizeSession(session.sessionId, endReason, session.secondsConsumed);
        await this.translationStateService.deleteBalance(session.listenerId, session.sessionId);
        await this.translationStateService.clearLowBalanceFlag(session.sessionId);
    }
};
exports.BillingTickerService = BillingTickerService;
exports.BillingTickerService = BillingTickerService = BillingTickerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(translation_config_1.TRANSLATION_CONFIG)),
    __metadata("design:paramtypes", [translation_state_service_1.TranslationStateService,
        users_repository_1.UsersRepository,
        translation_usage_repository_1.TranslationUsageRepository, Object])
], BillingTickerService);
//# sourceMappingURL=billing-ticker.service.js.map