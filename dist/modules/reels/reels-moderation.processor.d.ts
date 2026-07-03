import { WorkerHost } from '@nestjs/bullmq';
import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { ReelsModerationService } from './reels-moderation.service';
export declare const REELS_MODERATION_QUEUE = "reels-moderation";
export declare class ReelsModerationProcessor extends WorkerHost implements OnModuleInit, OnModuleDestroy {
    private readonly moderation;
    private readonly queue;
    private readonly logger;
    private sweepTimer?;
    constructor(moderation: ReelsModerationService, queue: Queue);
    onModuleInit(): void;
    onModuleDestroy(): void;
    process(job: Job<{
        reelId: string;
    }>): Promise<void>;
    private sweep;
}
