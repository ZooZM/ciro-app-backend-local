export declare class SegmentLanguageLock {
    private locked;
    onResult(detectedLanguage: string | null | undefined, isFinal: boolean): string | null;
    reset(): void;
    get current(): string | null;
}
export declare class SpeakerLanguageCache {
    private readonly cache;
    private key;
    recordDetectedLanguage(roomId: string, speakerId: string, language: string): void;
    primaryLanguageForNextSegment(roomId: string, speakerId: string, defaultLanguage: string): string;
    clear(roomId: string, speakerId: string): void;
}
