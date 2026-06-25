import type { Room } from '@livekit/rtc-node';
export declare const CAPTION_DATA_TOPIC = "translation";
export type CaptionType = 'interim' | 'final';
export interface CaptionPayload {
    v: 1;
    type: CaptionType;
    speakerId: string;
    sourceLanguage: string;
    targetLanguage: string;
    text: string;
    segmentId: string;
    seq: number;
    ts: number;
}
export interface DispatchCaptionInput {
    room: Room;
    listenerIdentities: string[];
    speakerId: string;
    sourceLanguage: string;
    targetLanguage: string;
    text: string;
    segmentId: string;
    seq: number;
    type: CaptionType;
}
export declare class CaptionDispatchService {
    private readonly logger;
    dispatch(input: DispatchCaptionInput): Promise<void>;
}
