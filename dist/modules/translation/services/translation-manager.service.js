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
var TranslationManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationManagerService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const users_repository_1 = require("../../users/users.repository");
const translation_state_service_1 = require("./translation-state.service");
const translation_service_1 = require("./translation.service");
const caption_dispatch_service_1 = require("./caption-dispatch.service");
const language_detection_util_1 = require("./language-detection.util");
const translation_config_1 = require("../translation.config");
const translation_usage_schema_1 = require("../schemas/translation-usage.schema");
const billing_ticker_service_1 = require("./billing-ticker.service");
const speech_pipeline_service_1 = require("./speech-pipeline.service");
let TranslationManagerService = TranslationManagerService_1 = class TranslationManagerService {
    speechPipelineService;
    translationStateService;
    translationService;
    captionDispatchService;
    speakerLanguageCache;
    usersRepository;
    billingTickerService;
    config;
    logger = new common_1.Logger(TranslationManagerService_1.name);
    instanceId = (0, crypto_1.randomUUID)();
    pipelines = new Map();
    pipelineOpens = new Map();
    eventHandler;
    constructor(speechPipelineService, translationStateService, translationService, captionDispatchService, speakerLanguageCache, usersRepository, billingTickerService, config) {
        this.speechPipelineService = speechPipelineService;
        this.translationStateService = translationStateService;
        this.translationService = translationService;
        this.captionDispatchService = captionDispatchService;
        this.speakerLanguageCache = speakerLanguageCache;
        this.usersRepository = usersRepository;
        this.billingTickerService = billingTickerService;
        this.config = config;
    }
    setEventHandler(handler) {
        this.eventHandler = handler;
    }
    pipelineKey(roomId, speakerId) {
        return `${roomId}:${speakerId}`;
    }
    translationKey(roomId, speakerId, targetLanguage) {
        return `${roomId}:${speakerId}:${targetLanguage}`;
    }
    async subscribe(roomId, speakerId, listenerId, targetLanguage) {
        const remainingSeconds = await this.usersRepository.getTranslationBalanceSeconds(listenerId);
        if (remainingSeconds < this.config.activationMinSeconds) {
            return { status: 'denied', reason: 'insufficient_credits' };
        }
        await this.translationStateService.addSubscriber(roomId, speakerId, listenerId, targetLanguage);
        const key = this.pipelineKey(roomId, speakerId);
        let pipeline = this.pipelines.get(key);
        if (!pipeline) {
            try {
                pipeline = await this.getOrOpenPipeline(key, roomId, speakerId);
            }
            catch (error) {
                this.logger.error(`Failed to open pipeline for ${key}: ${error.message}`);
                await this.translationStateService.removeSubscriber(roomId, speakerId, listenerId);
                return {
                    status: 'unavailable',
                    reason: 'service_outage',
                    transient: true,
                };
            }
        }
        else if (pipeline.graceTimer) {
            clearTimeout(pipeline.graceTimer);
            pipeline.graceTimer = undefined;
        }
        this.addListenerToTarget(pipeline, listenerId, targetLanguage);
        if (this.billingTickerService.hasSession(roomId, speakerId, listenerId)) {
            this.billingTickerService.updateTargetLanguage(roomId, speakerId, listenerId, targetLanguage);
        }
        else {
            await this.billingTickerService.start({
                listenerId,
                roomId,
                speakerId,
                targetLanguage,
                initialBalanceSeconds: remainingSeconds,
            }, {
                onCreditsLow: (remaining) => {
                    this.eventHandler?.onCreditsLow(listenerId, {
                        roomId,
                        speakerId,
                        remainingSeconds: remaining,
                        thresholdSeconds: this.config.lowBalanceSeconds,
                    });
                },
                onExhausted: () => {
                    void this.handleCreditsExhausted(roomId, speakerId, listenerId);
                },
            });
        }
        return { status: 'subscribed', targetLanguage, remainingSeconds };
    }
    async handleCreditsExhausted(roomId, speakerId, listenerId) {
        await this.unsubscribe(roomId, speakerId, listenerId, translation_usage_schema_1.TranslationUsageEndReason.CREDITS_EXHAUSTED);
        this.eventHandler?.onCreditsExhausted(listenerId, {
            roomId,
            speakerId,
            remainingSeconds: 0,
            action: 'branch_closed',
        });
    }
    async unsubscribe(roomId, speakerId, listenerId, endReason = translation_usage_schema_1.TranslationUsageEndReason.USER_UNSUBSCRIBED) {
        const key = this.pipelineKey(roomId, speakerId);
        const pipeline = this.pipelines.get(key);
        if (pipeline) {
            this.removeListenerFromPipeline(pipeline, listenerId);
        }
        await this.billingTickerService.stop(roomId, speakerId, listenerId, endReason);
        const refCount = await this.translationStateService.removeSubscriber(roomId, speakerId, listenerId);
        if (refCount === 0 && pipeline) {
            this.scheduleTeardown(pipeline);
        }
    }
    removeListenerFromPipeline(pipeline, listenerId) {
        for (const [language, target] of pipeline.targets) {
            target.listenerIds.delete(listenerId);
            target.pendingListenerIds.delete(listenerId);
            this.dropTargetIfEmpty(pipeline, language, target);
        }
    }
    dropTargetIfEmpty(pipeline, targetLanguage, target) {
        if (target.listenerIds.size > 0 || target.pendingListenerIds.size > 0) {
            return;
        }
        pipeline.targets.delete(targetLanguage);
        this.translationService.clearPending(this.translationKey(pipeline.roomId, pipeline.speakerId, targetLanguage));
    }
    scheduleTeardown(pipeline) {
        if (pipeline.graceTimer)
            clearTimeout(pipeline.graceTimer);
        pipeline.graceTimer = setTimeout(() => {
            void this.completeTeardownIfIdle(pipeline);
        }, this.config.idleGraceMs);
    }
    async completeTeardownIfIdle(pipeline) {
        pipeline.graceTimer = undefined;
        const refCount = await this.translationStateService.getRefCount(pipeline.roomId, pipeline.speakerId);
        if (refCount > 0)
            return;
        await this.teardownPipeline(pipeline);
    }
    getOrOpenPipeline(key, roomId, speakerId) {
        let openPromise = this.pipelineOpens.get(key);
        if (!openPromise) {
            openPromise = this.openPipeline(roomId, speakerId);
            this.pipelineOpens.set(key, openPromise);
            void openPromise.then(() => this.pipelineOpens.delete(key), () => this.pipelineOpens.delete(key));
        }
        return openPromise;
    }
    async openPipeline(roomId, speakerId) {
        const acquired = await this.translationStateService.acquireOwnership(roomId, speakerId, this.instanceId);
        if (!acquired) {
            this.logger.warn(`Ownership lock for ${roomId}/${speakerId} already held; proceeding locally`);
        }
        const ref = {};
        const callbacks = {
            onTranscript: (result) => {
                if (ref.current)
                    this.handleTranscript(ref.current, result);
            },
            onError: (reason) => {
                if (ref.current)
                    void this.handlePipelineError(ref.current, reason);
            },
        };
        const handle = await this.speechPipelineService.open(roomId, speakerId, callbacks);
        const pipeline = {
            roomId,
            speakerId,
            livekitRoom: handle.livekitRoom,
            segmentLanguage: null,
            segmentId: (0, crypto_1.randomUUID)(),
            seq: 0,
            targets: new Map(),
        };
        ref.current = pipeline;
        this.pipelines.set(this.pipelineKey(roomId, speakerId), pipeline);
        return pipeline;
    }
    addListenerToTarget(pipeline, listenerId, targetLanguage) {
        for (const [language, target] of pipeline.targets) {
            if (language === targetLanguage)
                continue;
            target.listenerIds.delete(listenerId);
            target.pendingListenerIds.delete(listenerId);
            this.dropTargetIfEmpty(pipeline, language, target);
        }
        let target = pipeline.targets.get(targetLanguage);
        if (!target) {
            target = { listenerIds: new Set(), pendingListenerIds: new Set() };
            pipeline.targets.set(targetLanguage, target);
        }
        if (pipeline.segmentLanguage === null) {
            target.listenerIds.add(listenerId);
        }
        else {
            target.pendingListenerIds.add(listenerId);
        }
    }
    handleTranscript(pipeline, result) {
        const segmentId = pipeline.segmentId;
        pipeline.segmentLanguage = result.isFinal ? null : result.sourceLanguage;
        this.logger.debug(`[TRANSCRIPT] room=${pipeline.roomId} speaker=${pipeline.speakerId} isFinal=${result.isFinal} lang=${result.sourceLanguage} text="${result.text}" targets=${pipeline.targets.size}`);
        for (const [targetLanguage, target] of pipeline.targets) {
            this.logger.debug(`[TRANSCRIPT] target=${targetLanguage} activeListeners=${target.listenerIds.size} pendingListeners=${target.pendingListenerIds.size}`);
            if (target.listenerIds.size === 0)
                continue;
            const listenerIdentities = [...target.listenerIds];
            const key = this.translationKey(pipeline.roomId, pipeline.speakerId, targetLanguage);
            if (result.isFinal) {
                this.translationService
                    .translateFinal(key, result.text, targetLanguage, result.sourceLanguage)
                    .then((translated) => this.dispatchCaption(pipeline, listenerIdentities, segmentId, 'final', result.sourceLanguage, translated))
                    .catch((error) => {
                    this.logger.error(`Final translation failed for ${key}: ${error.message}`);
                });
            }
            else {
                this.translationService.scheduleInterimTranslation(key, result.text, targetLanguage, result.sourceLanguage, (translated) => this.dispatchCaption(pipeline, listenerIdentities, segmentId, 'interim', result.sourceLanguage, translated));
            }
        }
        if (result.isFinal) {
            for (const target of pipeline.targets.values()) {
                for (const listenerId of target.pendingListenerIds) {
                    target.listenerIds.add(listenerId);
                }
                target.pendingListenerIds.clear();
            }
            pipeline.segmentId = (0, crypto_1.randomUUID)();
        }
    }
    dispatchCaption(pipeline, listenerIdentities, segmentId, type, sourceLanguage, translated) {
        pipeline.seq += 1;
        this.logger.debug(`[DISPATCH] room=${pipeline.roomId} speaker=${pipeline.speakerId} type=${type} targetLang=${translated.targetLanguage} listeners=${JSON.stringify(listenerIdentities)} text="${translated.text}"`);
        for (const listenerId of listenerIdentities) {
            this.billingTickerService.recordCaption(pipeline.roomId, pipeline.speakerId, listenerId, type, sourceLanguage);
        }
        void this.captionDispatchService
            .dispatch({
            room: pipeline.livekitRoom,
            listenerIdentities,
            speakerId: pipeline.speakerId,
            sourceLanguage,
            targetLanguage: translated.targetLanguage,
            text: translated.text,
            segmentId,
            seq: pipeline.seq,
            type,
        })
            .catch((error) => {
            this.logger.error(`Caption dispatch failed for ${pipeline.roomId}/${pipeline.speakerId}: ${error.message}`);
        });
    }
    async handlePipelineError(pipeline, reason) {
        const key = this.pipelineKey(pipeline.roomId, pipeline.speakerId);
        if (this.pipelines.get(key) !== pipeline)
            return;
        const listenerIds = new Set();
        for (const target of pipeline.targets.values()) {
            for (const id of target.listenerIds)
                listenerIds.add(id);
            for (const id of target.pendingListenerIds)
                listenerIds.add(id);
        }
        const event = {
            roomId: pipeline.roomId,
            speakerId: pipeline.speakerId,
            reason,
            transient: reason === 'service_outage',
        };
        for (const listenerId of listenerIds) {
            this.eventHandler?.onTranslationUnavailable(listenerId, event);
            await this.billingTickerService.stop(pipeline.roomId, pipeline.speakerId, listenerId, translation_usage_schema_1.TranslationUsageEndReason.SERVICE_ERROR);
        }
        await this.teardownPipeline(pipeline);
    }
    async teardownPipeline(pipeline) {
        const key = this.pipelineKey(pipeline.roomId, pipeline.speakerId);
        if (this.pipelines.get(key) !== pipeline)
            return;
        this.pipelines.delete(key);
        if (pipeline.graceTimer) {
            clearTimeout(pipeline.graceTimer);
            pipeline.graceTimer = undefined;
        }
        for (const targetLanguage of pipeline.targets.keys()) {
            this.translationService.clearPending(this.translationKey(pipeline.roomId, pipeline.speakerId, targetLanguage));
        }
        this.speakerLanguageCache.clear(pipeline.roomId, pipeline.speakerId);
        await this.translationStateService.deleteSubscriptions(pipeline.roomId, pipeline.speakerId);
        await this.translationStateService.releaseOwnership(pipeline.roomId, pipeline.speakerId, this.instanceId);
        await this.speechPipelineService
            .close(pipeline.roomId, pipeline.speakerId)
            .catch((error) => {
            this.logger.error(`Pipeline teardown failed for ${key}: ${error.message}`);
        });
    }
};
exports.TranslationManagerService = TranslationManagerService;
exports.TranslationManagerService = TranslationManagerService = TranslationManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(7, (0, common_1.Inject)(translation_config_1.TRANSLATION_CONFIG)),
    __metadata("design:paramtypes", [speech_pipeline_service_1.SpeechPipelineService,
        translation_state_service_1.TranslationStateService,
        translation_service_1.TranslationService,
        caption_dispatch_service_1.CaptionDispatchService,
        language_detection_util_1.SpeakerLanguageCache,
        users_repository_1.UsersRepository,
        billing_ticker_service_1.BillingTickerService, Object])
], TranslationManagerService);
//# sourceMappingURL=translation-manager.service.js.map