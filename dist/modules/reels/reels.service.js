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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../users/schemas/user.schema");
const reels_repository_1 = require("./reels.repository");
const reels_notifications_service_1 = require("./reels-notifications.service");
let ReelsService = class ReelsService {
    repository;
    userModel;
    notifications;
    constructor(repository, userModel, notifications) {
        this.repository = repository;
        this.userModel = userModel;
        this.notifications = notifications;
    }
    async getBlockSet(viewerId) {
        if (!mongoose_2.Types.ObjectId.isValid(viewerId))
            return [];
        const viewerObjectId = new mongoose_2.Types.ObjectId(viewerId);
        const [viewer, reverseBlockers] = await Promise.all([
            this.userModel
                .findById(viewerObjectId)
                .select('blockedUsers')
                .lean()
                .exec(),
            this.userModel
                .find({ blockedUsers: viewerObjectId })
                .select('_id')
                .lean()
                .exec(),
        ]);
        const own = (viewer?.blockedUsers ?? []).map((id) => id.toString());
        const reverse = reverseBlockers.map((u) => u._id.toString());
        return [...new Set([...own, ...reverse])];
    }
    async getFeed(viewerId, query) {
        const excludeCreatorIds = await this.getBlockSet(viewerId);
        return this.repository.listFeed({
            viewerId,
            cursor: query.cursor,
            limit: query.limit ?? 10,
            creatorId: query.creatorId,
            hashtag: query.hashtag,
            excludeCreatorIds,
        });
    }
    async getReel(id, viewerId) {
        const excludeCreatorIds = await this.getBlockSet(viewerId);
        const reel = await this.repository.getReel(id, viewerId, excludeCreatorIds);
        if (!reel)
            throw new common_1.NotFoundException('Reel not found');
        return reel;
    }
    async toggleLike(id, viewerId) {
        const result = await this.repository.toggleLike(id, viewerId);
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        if (result.liked) {
            await this.notifications.notifyReelLike({
                actorId: viewerId,
                recipientId: result.reel.creatorId,
                reelId: result.reel.id,
            });
        }
        return { liked: result.liked, likesCount: result.likesCount };
    }
    async getComments(id, viewerId, query) {
        const excludeAuthorIds = await this.getBlockSet(viewerId);
        const result = await this.repository.listComments(id, {
            cursor: query.cursor,
            limit: query.limit ?? 20,
            excludeAuthorIds,
        });
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        return result;
    }
    async addComment(id, viewerId, text) {
        const result = await this.repository.addComment(id, viewerId, text);
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        return result;
    }
    async recordShare(id, viewerId) {
        const result = await this.repository.recordShare(id, viewerId);
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        return result;
    }
    async getProfile(userId, viewerId) {
        const excludeCreatorIds = await this.getBlockSet(viewerId);
        const profile = await this.repository.getProfile(userId, viewerId, excludeCreatorIds);
        if (!profile)
            throw new common_1.NotFoundException('User not found');
        return profile;
    }
    async toggleFollow(userId, viewerId) {
        const result = await this.repository.toggleFollow(userId, viewerId);
        if (result === 'self') {
            throw new common_1.BadRequestException('Cannot follow yourself');
        }
        if (!result)
            throw new common_1.NotFoundException('User not found');
        if (result.following) {
            await this.notifications.notifyNewFollower({
                actorId: viewerId,
                recipientId: userId,
            });
        }
        return result;
    }
    async recordView(id, viewerId) {
        const result = await this.repository.recordView(id, viewerId);
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        return result;
    }
    async toggleSave(id, viewerId) {
        const result = await this.repository.toggleSave(id, viewerId);
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        return result;
    }
    async getLiked(viewerId, query) {
        const excludeCreatorIds = await this.getBlockSet(viewerId);
        return this.repository.listLiked(viewerId, {
            cursor: query.cursor,
            limit: query.limit ?? 10,
            excludeCreatorIds,
        });
    }
    async getSaved(viewerId, query) {
        const excludeCreatorIds = await this.getBlockSet(viewerId);
        return this.repository.listSaved(viewerId, {
            cursor: query.cursor,
            limit: query.limit ?? 10,
            excludeCreatorIds,
        });
    }
    async searchReels(viewerId, query) {
        const excludeCreatorIds = await this.getBlockSet(viewerId);
        return this.repository.searchReels({
            viewerId,
            q: query.q,
            cursor: query.cursor,
            limit: query.limit ?? 10,
            excludeCreatorIds,
        });
    }
    async searchUsers(viewerId, query) {
        const excludeUserIds = await this.getBlockSet(viewerId);
        return this.repository.searchUsers({
            viewerId,
            q: query.q,
            cursor: query.cursor,
            limit: query.limit ?? 10,
            excludeUserIds,
        });
    }
    async toggleBlock(targetId, viewerId) {
        if (targetId === viewerId) {
            throw new common_1.BadRequestException('Cannot block yourself');
        }
        if (!mongoose_2.Types.ObjectId.isValid(targetId)) {
            throw new common_1.NotFoundException('User not found');
        }
        const target = await this.userModel.findById(targetId).exec();
        if (!target)
            throw new common_1.NotFoundException('User not found');
        const viewerObjectId = new mongoose_2.Types.ObjectId(viewerId);
        const targetObjectId = new mongoose_2.Types.ObjectId(targetId);
        const viewer = await this.userModel.findById(viewerObjectId).exec();
        if (!viewer)
            throw new common_1.NotFoundException('User not found');
        const alreadyBlocked = viewer.blockedUsers.some((id) => id.equals(targetObjectId));
        if (alreadyBlocked) {
            await this.userModel
                .updateOne({ _id: viewerObjectId }, { $pull: { blockedUsers: targetObjectId } })
                .exec();
            return { blocked: false };
        }
        await this.userModel
            .updateOne({ _id: viewerObjectId }, { $addToSet: { blockedUsers: targetObjectId } })
            .exec();
        return { blocked: true };
    }
};
exports.ReelsService = ReelsService;
exports.ReelsService = ReelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(reels_repository_1.REELS_REPOSITORY)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [Object, mongoose_2.Model,
        reels_notifications_service_1.ReelsNotificationsService])
], ReelsService);
//# sourceMappingURL=reels.service.js.map