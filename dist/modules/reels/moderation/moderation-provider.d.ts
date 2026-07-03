export interface ModerationVerdict {
    verdict: 'clean' | 'flagged';
    flaggedSource?: 'video' | 'description';
    categories?: string[];
    providerRef?: string;
}
export declare const MODERATION_PROVIDER: unique symbol;
export interface ModerationProvider {
    analyze(videoPath: string, description: string): Promise<ModerationVerdict>;
}
