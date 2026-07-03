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
var ReelsModerationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsModerationService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const path_1 = require("path");
const reel_schema_1 = require("./schemas/reel.schema");
const user_schema_1 = require("../users/schemas/user.schema");
const moderation_provider_1 = require("./moderation/moderation-provider");
const reels_notifications_service_1 = require("./reels-notifications.service");
let ReelsModerationService = ReelsModerationService_1 = class ReelsModerationService {
    reelModel;
    userModel;
    provider;
    notifications;
    logger = new common_1.Logger(ReelsModerationService_1.name);
    constructor(reelModel, userModel, provider, notifications) {
        this.reelModel = reelModel;
        this.userModel = userModel;
        this.provider = provider;
        this.notifications = notifications;
    }
    async moderateReel(reelId) {
        if (!mongoose_2.Types.ObjectId.isValid(reelId))
            return;
        const reel = await this.reelModel.findById(reelId).exec();
        if (!reel || reel.status !== reel_schema_1.ReelStatus.PENDING_MODERATION)
            return;
        const uploadedAt = reel.createdAt ?? new Date();
        const videoPath = this.toLocalPath(reel.videoUrl);
        const result = await this.provider.analyze(videoPath, reel.description);
        const verdictLatencyMs = Date.now() - uploadedAt.getTime();
        this.logger.log(`Reel ${reelId} verdict: ${result.verdict} (${verdictLatencyMs}ms since upload — SC-018)`);
        if (result.verdict === 'clean') {
            await this.publish(reel);
        }
        else {
            await this.reject(reel, result);
        }
    }
    async findStalePendingIds(staleMs) {
        const stale = await this.reelModel
            .find({
            status: reel_schema_1.ReelStatus.PENDING_MODERATION,
            updatedAt: { $lt: new Date(Date.now() - staleMs) },
        })
            .select('_id')
            .lean()
            .exec();
        return stale.map((doc) => doc._id.toString());
    }
    toLocalPath(videoUrl) {
        return (0, path_1.join)(process.cwd(), videoUrl.replace(/^\/+/, ''));
    }
    async publish(reel) {
        const updated = await this.reelModel
            .findOneAndUpdate({ _id: reel._id, status: reel_schema_1.ReelStatus.PENDING_MODERATION }, { $set: { status: reel_schema_1.ReelStatus.PUBLISHED, publishedAt: new Date() } })
            .exec();
        if (!updated)
            return;
        const mentions = await this.blockFilteredMentions(reel);
        await this.notifications.notifyMentions({
            actorId: reel.creatorId.toString(),
            reelId: reel._id.toString(),
            mentions,
        });
    }
    async blockFilteredMentions(reel) {
        if (reel.mentions.length === 0)
            return [];
        const [creator, reverseBlockers] = await Promise.all([
            this.userModel
                .findById(reel.creatorId)
                .select('blockedUsers')
                .lean()
                .exec(),
            this.userModel
                .find({
                blockedUsers: reel.creatorId,
                _id: { $in: reel.mentions.map((m) => m.userId) },
            })
                .select('_id')
                .lean()
                .exec(),
        ]);
        const creatorBlocked = new Set((creator?.blockedUsers ?? []).map((id) => id.toString()));
        const reverseBlocked = new Set(reverseBlockers.map((u) => u._id.toString()));
        return reel.mentions
            .filter((m) => !creatorBlocked.has(m.userId.toString()) &&
            !reverseBlocked.has(m.userId.toString()))
            .map((m) => ({ userId: m.userId.toString(), username: m.username }));
    }
    async reject(reel, result) {
        const updated = await this.reelModel
            .findOneAndUpdate({ _id: reel._id, status: reel_schema_1.ReelStatus.PENDING_MODERATION }, {
            $set: {
                status: reel_schema_1.ReelStatus.REJECTED,
                moderation: {
                    verdict: result.verdict,
                    flaggedSource: result.flaggedSource,
                    categories: result.categories ?? [],
                    providerRef: result.providerRef,
                    completedAt: new Date(),
                },
            },
        })
            .exec();
        if (!updated)
            return;
        await this.notifications.notifyReelRejected({
            recipientId: reel.creatorId.toString(),
            reelId: reel._id.toString(),
        });
    }
};
exports.ReelsModerationService = ReelsModerationService;
exports.ReelsModerationService = ReelsModerationService = ReelsModerationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(reel_schema_1.Reel.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(2, (0, common_1.Inject)(moderation_provider_1.MODERATION_PROVIDER)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model, Object, reels_notifications_service_1.ReelsNotificationsService])
], ReelsModerationService);
//# sourceMappingURL=reels-moderation.service.js.map