import { ModerationProvider, ModerationVerdict } from './moderation-provider';
export declare class StubModerationProvider implements ModerationProvider {
    analyze(videoPath: string, description: string): Promise<ModerationVerdict>;
}
