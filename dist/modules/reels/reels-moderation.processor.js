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
var ReelsModerationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsModerationProcessor = exports.REELS_MODERATION_QUEUE = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const reels_moderation_service_1 = require("./reels-moderation.service");
exports.REELS_MODERATION_QUEUE = 'reels-moderation';
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
let ReelsModerationProcessor = ReelsModerationProcessor_1 = class ReelsModerationProcessor extends bullmq_1.WorkerHost {
    moderation;
    queue;
    logger = new common_1.Logger(ReelsModerationProcessor_1.name);
    sweepTimer;
    constructor(moderation, queue) {
        super();
        this.moderation = moderation;
        this.queue = queue;
    }
    onModuleInit() {
        void this.sweep();
        this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    }
    onModuleDestroy() {
        if (this.sweepTimer)
            clearInterval(this.sweepTimer);
    }
    async process(job) {
        await this.moderation.moderateReel(job.data.reelId);
    }
    async sweep() {
        try {
            const staleIds = await this.moderation.findStalePendingIds(STALE_THRESHOLD_MS);
            for (const reelId of staleIds) {
                await this.queue.add('moderate', { reelId }, { jobId: reelId });
            }
            if (staleIds.length > 0) {
                this.logger.log(`Sweep re-enqueued ${staleIds.length} stale reel(s)`);
            }
        }
        catch (err) {
            this.logger.warn(`Sweep failed: ${err.message}`);
        }
    }
};
exports.ReelsModerationProcessor = ReelsModerationProcessor;
exports.ReelsModerationProcessor = ReelsModerationProcessor = ReelsModerationProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bullmq_1.Processor)(exports.REELS_MODERATION_QUEUE),
    __param(1, (0, bullmq_1.InjectQueue)(exports.REELS_MODERATION_QUEUE)),
    __metadata("design:paramtypes", [reels_moderation_service_1.ReelsModerationService,
        bullmq_2.Queue])
], ReelsModerationProcessor);
//# sourceMappingURL=reels-moderation.processor.js.map