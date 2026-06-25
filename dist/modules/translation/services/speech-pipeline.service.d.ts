import type { v1 } from '@google-cloud/speech';
import { Room } from '@livekit/rtc-node';
import { LiveKitRtcProvider } from '../providers/livekit-rtc.provider';
import type { TranslationConfig } from '../translation.config';
import { SpeakerLanguageCache } from './language-detection.util';
export type PipelineFailureReason = 'language_undetected' | 'unsupported_language' | 'service_outage';
export interface TranscriptResult {
    text: string;
    isFinal: boolean;
    sourceLanguage: string;
}
export interface SpeechPipelineCallbacks {
    onTranscript(result: TranscriptResult): void;
    onError(reason: PipelineFailureReason): void;
}
export interface OpenPipelineHandle {
    livekitRoom: Room;
}
export declare class SpeechPipelineService {
    private readonly liveKitRtcProvider;
    private readonly speechClient;
    private readonly config;
    private readonly speakerLanguageCache;
    private readonly logger;
    private readonly sessions;
    constructor(liveKitRtcProvider: LiveKitRtcProvider, speechClient: v1.SpeechClient, config: TranslationConfig, speakerLanguageCache: SpeakerLanguageCache);
    private sessionKey;
    open(roomId: string, speakerId: string, callbacks: SpeechPipelineCallbacks): Promise<OpenPipelineHandle>;
    close(roomId: string, speakerId: string): Promise<void>;
    private subscribeToSpeakerAudio;
    private findAudioPublication;
    private openStream;
    private scheduleRotation;
    private rotateStream;
    private completeRotation;
    private endStream;
    private pumpAudio;
    private computeRmsEnergy;
    private writeToStream;
}
