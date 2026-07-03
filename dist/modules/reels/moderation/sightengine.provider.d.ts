import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ModerationProvider, ModerationVerdict } from './moderation-provider';
export declare class SightengineModerationProvider implements ModerationProvider {
    private readonly httpService;
    private readonly configService;
    private readonly logger;
    constructor(httpService: HttpService, configService: ConfigService);
    analyze(videoPath: string, description: string): Promise<ModerationVerdict>;
    private checkVideo;
    private checkText;
}
