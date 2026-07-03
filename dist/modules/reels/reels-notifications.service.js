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
var ReelsNotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsNotificationsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const push_service_1 = require("../notifications/push.service");
const device_tokens_repository_1 = require("../notifications/device-tokens.repository");
const user_schema_1 = require("../users/schemas/user.schema");
const notification_event_schema_1 = require("./schemas/notification-event.schema");
let ReelsNotificationsService = ReelsNotificationsService_1 = class ReelsNotificationsService {
    eventModel;
    userModel;
    pushService;
    deviceTokens;
    logger = new common_1.Logger(ReelsNotificationsService_1.name);
    constructor(eventModel, userModel, pushService, deviceTokens) {
        this.eventModel = eventModel;
        this.userModel = userModel;
        this.pushService = pushService;
        this.deviceTokens = deviceTokens;
    }
    async notifyNewFollower(params) {
        if (params.actorId === params.recipientId)
            return;
        const wasNew = await this.recordEvent({
            type: notification_event_schema_1.NotificationEventType.NEW_FOLLOWER,
            actorId: params.actorId,
            recipientId: params.recipientId,
        });
        if (!wasNew)
            return;
        const actor = await this.userModel
            .findById(params.actorId)
            .select('name')
            .lean()
            .exec();
        await this.push(params.recipientId, {
            title: actor?.name ?? 'Someone',
            body: 'notif_new_follower',
            data: {
                type: notification_event_schema_1.NotificationEventType.NEW_FOLLOWER,
                actorId: params.actorId,
            },
        });
    }
    async notifyReelLike(params) {
        if (params.actorId === params.recipientId)
            return;
        const wasNew = await this.recordEvent({
            type: notification_event_schema_1.NotificationEventType.REEL_LIKE,
            actorId: params.actorId,
            recipientId: params.recipientId,
            reelId: params.reelId,
        });
        if (!wasNew)
            return;
        const actor = await this.userModel
            .findById(params.actorId)
            .select('name')
            .lean()
            .exec();
        await this.push(params.recipientId, {
            title: actor?.name ?? 'Someone',
            body: 'notif_new_like',
            data: {
                type: notification_event_schema_1.NotificationEventType.REEL_LIKE,
                actorId: params.actorId,
                reelId: params.reelId,
            },
        });
    }
    async notifyMentions(params) {
        for (const mention of params.mentions) {
            if (mention.userId === params.actorId)
                continue;
            const wasNew = await this.recordEvent({
                type: notification_event_schema_1.NotificationEventType.REEL_MENTION,
                actorId: params.actorId,
                recipientId: mention.userId,
                reelId: params.reelId,
            });
            if (!wasNew)
                continue;
            const actor = await this.userModel
                .findById(params.actorId)
                .select('name')
                .lean()
                .exec();
            await this.push(mention.userId, {
                title: actor?.name ?? 'Someone',
                body: 'notif_mention',
                data: {
                    type: notification_event_schema_1.NotificationEventType.REEL_MENTION,
                    actorId: params.actorId,
                    reelId: params.reelId,
                },
            });
        }
    }
    async notifyReelRejected(params) {
        const wasNew = await this.recordEvent({
            type: notification_event_schema_1.NotificationEventType.REEL_REJECTED,
            actorId: null,
            recipientId: params.recipientId,
            reelId: params.reelId,
        });
        if (!wasNew)
            return;
        await this.push(params.recipientId, {
            title: 'CiroChat',
            body: 'notif_rejected',
            data: {
                type: notification_event_schema_1.NotificationEventType.REEL_REJECTED,
                reelId: params.reelId,
            },
        });
    }
    async recordEvent(params) {
        try {
            await this.eventModel.create({
                type: params.type,
                actorId: params.actorId ? new mongoose_2.Types.ObjectId(params.actorId) : null,
                recipientId: new mongoose_2.Types.ObjectId(params.recipientId),
                reelId: params.reelId ? new mongoose_2.Types.ObjectId(params.reelId) : undefined,
            });
            return true;
        }
        catch {
            return false;
        }
    }
    async push(recipientId, payload) {
        const tokens = await this.deviceTokens.getTokens(recipientId);
        for (const doc of tokens) {
            await this.pushService.sendPush(doc.token, payload);
        }
        if (tokens.length === 0) {
            this.logger.debug(`No device tokens for ${recipientId} — event recorded, push skipped`);
        }
    }
};
exports.ReelsNotificationsService = ReelsNotificationsService;
exports.ReelsNotificationsService = ReelsNotificationsService = ReelsNotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(notification_event_schema_1.NotificationEvent.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        push_service_1.PushService,
        device_tokens_repository_1.DeviceTokensRepository])
], ReelsNotificationsService);
//# sourceMappingURL=reels-notifications.service.js.map