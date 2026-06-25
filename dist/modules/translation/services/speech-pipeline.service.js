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
var SpeechPipelineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeechPipelineService = void 0;
const common_1 = require("@nestjs/common");
const rtc_node_1 = require("@livekit/rtc-node");
const google_speech_provider_1 = require("../providers/google-speech.provider");
const livekit_rtc_provider_1 = require("../providers/livekit-rtc.provider");
const translation_config_1 = require("../translation.config");
const language_detection_util_1 = require("./language-detection.util");
const STT_SAMPLE_RATE_HZ = 16000;
const STT_CHANNELS = 1;
const SPEAKER_TRACK_TIMEOUT_MS = 15_000;
const LANGUAGE_DETECTION_TIMEOUT_MS = 10_000;
const VAD_ENERGY_THRESHOLD = 400;
const VAD_SILENCE_WINDOW_MS = 500;
const PRE_SPEECH_BUFFER_MS = 300;
const PUMP_LOG_INTERVAL_MS = 2_000;
let SpeechPipelineService = SpeechPipelineService_1 = class SpeechPipelineService {
    liveKitRtcProvider;
    speechClient;
    config;
    speakerLanguageCache;
    logger = new common_1.Logger(SpeechPipelineService_1.name);
    sessions = new Map();
    constructor(liveKitRtcProvider, speechClient, config, speakerLanguageCache) {
        this.liveKitRtcProvider = liveKitRtcProvider;
        this.speechClient = speechClient;
        this.config = config;
        this.speakerLanguageCache = speakerLanguageCache;
    }
    sessionKey(roomId, speakerId) {
        return `${roomId}:${speakerId}`;
    }
    async open(roomId, speakerId, callbacks) {
        const livekitRoom = this.liveKitRtcProvider.createRoom();
        const agentIdentity = `translation-agent:${roomId}:${speakerId}`;
        const token = await this.liveKitRtcProvider.createAgentToken(roomId, agentIdentity);
        await livekitRoom.connect(this.liveKitRtcProvider.wsUrl, token, this.liveKitRtcProvider.connectOptions);
        let audioTrack;
        try {
            audioTrack = await this.subscribeToSpeakerAudio(livekitRoom, speakerId);
        }
        catch (error) {
            await livekitRoom.disconnect();
            throw error;
        }
        const segmentLock = new language_detection_util_1.SegmentLanguageLock();
        const audioStream = new rtc_node_1.AudioStream(audioTrack, STT_SAMPLE_RATE_HZ, STT_CHANNELS);
        const current = this.openStream(roomId, speakerId, segmentLock, callbacks, {
            applyDetectionTimeout: true,
        });
        const session = {
            roomId,
            speakerId,
            livekitRoom,
            audioStream,
            segmentLock,
            callbacks,
            current,
            closed: false,
        };
        this.sessions.set(this.sessionKey(roomId, speakerId), session);
        this.scheduleRotation(session);
        void this.pumpAudio(session);
        return { livekitRoom };
    }
    async close(roomId, speakerId) {
        const key = this.sessionKey(roomId, speakerId);
        const session = this.sessions.get(key);
        if (!session)
            return;
        session.closed = true;
        if (session.rotationTimer)
            clearTimeout(session.rotationTimer);
        if (session.overlapTimer)
            clearTimeout(session.overlapTimer);
        session.current.suppressed.value = true;
        this.endStream(session.current);
        if (session.next) {
            session.next.suppressed.value = true;
            this.endStream(session.next);
        }
        this.sessions.delete(key);
        await session.livekitRoom.disconnect();
    }
    async subscribeToSpeakerAudio(room, speakerId) {
        const existingPublication = this.findAudioPublication(room, speakerId);
        if (existingPublication?.track) {
            return existingPublication.track;
        }
        if (existingPublication && !existingPublication.subscribed) {
            existingPublication.setSubscribed(true);
        }
        return new Promise((resolve, reject) => {
            const onTrackSubscribed = (track, publication, participant) => {
                if (participant.identity === speakerId &&
                    publication.kind === rtc_node_1.TrackKind.KIND_AUDIO) {
                    cleanup();
                    resolve(track);
                }
            };
            const onTrackPublished = (publication, participant) => {
                if (participant.identity === speakerId &&
                    publication.kind === rtc_node_1.TrackKind.KIND_AUDIO) {
                    publication.setSubscribed(true);
                }
            };
            const onParticipantConnected = (participant) => {
                if (participant.identity !== speakerId)
                    return;
                const publication = this.findAudioPublication(room, speakerId);
                if (publication && !publication.subscribed) {
                    publication.setSubscribed(true);
                }
            };
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Timed out waiting for speaker ${speakerId}'s audio track`));
            }, SPEAKER_TRACK_TIMEOUT_MS);
            const cleanup = () => {
                clearTimeout(timeout);
                room.off(rtc_node_1.RoomEvent.TrackSubscribed, onTrackSubscribed);
                room.off(rtc_node_1.RoomEvent.TrackPublished, onTrackPublished);
                room.off(rtc_node_1.RoomEvent.ParticipantConnected, onParticipantConnected);
            };
            room.on(rtc_node_1.RoomEvent.TrackSubscribed, onTrackSubscribed);
            room.on(rtc_node_1.RoomEvent.TrackPublished, onTrackPublished);
            room.on(rtc_node_1.RoomEvent.ParticipantConnected, onParticipantConnected);
        });
    }
    findAudioPublication(room, speakerId) {
        const participant = room.remoteParticipants.get(speakerId);
        if (!participant)
            return undefined;
        for (const publication of participant.trackPublications.values()) {
            if (publication.kind === rtc_node_1.TrackKind.KIND_AUDIO) {
                return publication;
            }
        }
        return undefined;
    }
    openStream(roomId, speakerId, segmentLock, callbacks, opts) {
        const primaryLanguage = this.speakerLanguageCache.primaryLanguageForNextSegment(roomId, speakerId, this.config.primaryLanguage);
        const alternativeLanguageCodes = this.config.candidateLanguages.filter((code) => code !== primaryLanguage);
        const stream = this.speechClient._streamingRecognize();
        const suppressed = { value: false };
        let languageDetected = false;
        let detectionTimeout;
        if (opts.applyDetectionTimeout) {
            detectionTimeout = setTimeout(() => {
                if (!languageDetected) {
                    callbacks.onError('language_undetected');
                }
            }, LANGUAGE_DETECTION_TIMEOUT_MS);
        }
        stream.on('data', (response) => {
            if (suppressed.value)
                return;
            if (response.error) {
                if (detectionTimeout)
                    clearTimeout(detectionTimeout);
                const isAudioTimeout = response.error.code === 11 ||
                    (response.error.message ?? '').includes('Audio Timeout');
                const reason = isAudioTimeout
                    ? 'language_undetected'
                    : 'service_outage';
                this.logger.warn(`STT error for ${roomId}/${speakerId} [${reason}]: ${response.error.message ?? 'unknown error'}`);
                callbacks.onError(reason);
                return;
            }
            for (const result of response.results ?? []) {
                const transcript = result.alternatives?.[0]?.transcript;
                if (!transcript)
                    continue;
                const isFinal = !!result.isFinal;
                const lockedLanguage = segmentLock.onResult(result.languageCode ?? null, isFinal);
                if (!lockedLanguage)
                    continue;
                if (!languageDetected) {
                    languageDetected = true;
                    if (detectionTimeout)
                        clearTimeout(detectionTimeout);
                }
                if (isFinal) {
                    this.speakerLanguageCache.recordDetectedLanguage(roomId, speakerId, lockedLanguage);
                }
                callbacks.onTranscript({
                    text: transcript,
                    isFinal,
                    sourceLanguage: lockedLanguage,
                });
            }
        });
        stream.on('error', (error) => {
            if (suppressed.value)
                return;
            if (detectionTimeout)
                clearTimeout(detectionTimeout);
            const isAudioTimeout = error.code === 11 ||
                error.message.includes('Audio Timeout');
            const reason = isAudioTimeout ? 'language_undetected' : 'service_outage';
            this.logger.warn(`STT stream error for ${roomId}/${speakerId} [${reason}]: ${error.message}`);
            callbacks.onError(reason);
        });
        stream.write({
            streamingConfig: {
                config: {
                    encoding: 'LINEAR16',
                    sampleRateHertz: STT_SAMPLE_RATE_HZ,
                    languageCode: primaryLanguage,
                    ...(alternativeLanguageCodes.length > 0
                        ? { alternativeLanguageCodes }
                        : {}),
                },
                interimResults: true,
            },
        });
        return { stream, suppressed, detectionTimeout };
    }
    scheduleRotation(session) {
        session.rotationTimer = setTimeout(() => {
            this.rotateStream(session);
        }, this.config.sttRotationLeadMs);
    }
    rotateStream(session) {
        if (session.closed)
            return;
        const next = this.openStream(session.roomId, session.speakerId, session.segmentLock, session.callbacks, { applyDetectionTimeout: false });
        next.suppressed.value = true;
        session.next = next;
        session.overlapTimer = setTimeout(() => {
            this.completeRotation(session);
        }, this.config.sttRotationOverlapMs);
    }
    completeRotation(session) {
        if (session.closed || !session.next)
            return;
        const old = session.current;
        old.suppressed.value = true;
        this.endStream(old);
        const next = session.next;
        next.suppressed.value = false;
        session.current = next;
        session.next = undefined;
        this.scheduleRotation(session);
    }
    endStream(handle) {
        if (handle.detectionTimeout)
            clearTimeout(handle.detectionTimeout);
        try {
            handle.stream.end();
            handle.stream.cancel();
        }
        catch {
        }
    }
    async pumpAudio(session) {
        const key = `${session.roomId}/${session.speakerId}`;
        let speechActive = false;
        let silenceStartMs = null;
        let vadGated = false;
        const preBuffer = [];
        let lastPumpLogMs = 0;
        let frameCount = 0;
        try {
            for await (const frame of session.audioStream) {
                if (session.closed)
                    break;
                frameCount++;
                const audioContent = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
                const pcm = new Int16Array(frame.data.buffer, frame.data.byteOffset, Math.floor(frame.data.byteLength / 2));
                const rms = this.computeRmsEnergy(pcm);
                const nowMs = Date.now();
                if (rms > VAD_ENERGY_THRESHOLD) {
                    if (!speechActive) {
                        speechActive = true;
                        silenceStartMs = null;
                        if (vadGated) {
                            vadGated = false;
                            const flushed = preBuffer.length;
                            for (const { audioContent: buf } of preBuffer) {
                                this.writeToStream(session.current, buf);
                                if (session.next)
                                    this.writeToStream(session.next, buf);
                            }
                            preBuffer.length = 0;
                            this.logger.log(`[VAD] Speech Detected | ${key}` +
                                ` | rms=${rms.toFixed(0)} gate lifted, flushed ${flushed} pre-speech frames`);
                        }
                        else {
                            this.logger.log(`[VAD] Speech Detected | ${key}` +
                                ` | rms=${rms.toFixed(0)} threshold=${VAD_ENERGY_THRESHOLD}`);
                        }
                    }
                }
                else {
                    if (speechActive) {
                        speechActive = false;
                        silenceStartMs = nowMs;
                    }
                    else if (silenceStartMs === null) {
                        silenceStartMs = nowMs;
                    }
                    if (!vadGated &&
                        silenceStartMs !== null &&
                        nowMs - silenceStartMs >= VAD_SILENCE_WINDOW_MS) {
                        vadGated = true;
                        this.logger.log(`[VAD] Silence Timeout Triggered | ${key}` +
                            ` | silenceDuration=${nowMs - silenceStartMs}ms` +
                            ` threshold=${VAD_SILENCE_WINDOW_MS}ms rms=${rms.toFixed(0)}` +
                            ` — STT gate closed`);
                    }
                }
                if (!vadGated) {
                    this.writeToStream(session.current, audioContent);
                    if (session.next)
                        this.writeToStream(session.next, audioContent);
                }
                else {
                    preBuffer.push({ audioContent, timestamp: nowMs });
                    while (preBuffer.length > 0 &&
                        nowMs - preBuffer[0].timestamp > PRE_SPEECH_BUFFER_MS) {
                        preBuffer.shift();
                    }
                }
                if (nowMs - lastPumpLogMs >= PUMP_LOG_INTERVAL_MS) {
                    lastPumpLogMs = nowMs;
                    this.logger.log(`[STT] Pumping Audio | ${key}` +
                        ` | frames=${frameCount} speechActive=${speechActive}` +
                        ` vadGated=${vadGated} rms=${rms.toFixed(0)}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`Audio pump stopped for ${session.roomId}/${session.speakerId}: ${error.message}`);
        }
    }
    computeRmsEnergy(samples) {
        if (samples.length === 0)
            return 0;
        let sumSq = 0;
        for (let i = 0; i < samples.length; i++) {
            sumSq += samples[i] * samples[i];
        }
        return Math.sqrt(sumSq / samples.length);
    }
    writeToStream(handle, audioContent) {
        if (handle.stream.destroyed || !handle.stream.writable)
            return;
        handle.stream.write({ audioContent });
    }
};
exports.SpeechPipelineService = SpeechPipelineService;
exports.SpeechPipelineService = SpeechPipelineService = SpeechPipelineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(google_speech_provider_1.GOOGLE_SPEECH_CLIENT)),
    __param(2, (0, common_1.Inject)(translation_config_1.TRANSLATION_CONFIG)),
    __metadata("design:paramtypes", [livekit_rtc_provider_1.LiveKitRtcProvider, Function, Object, language_detection_util_1.SpeakerLanguageCache])
], SpeechPipelineService);
//# sourceMappingURL=speech-pipeline.service.js.map