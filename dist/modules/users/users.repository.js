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
exports.UsersRepository = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const base_repository_1 = require("../../common/repositories/base.repository");
const user_schema_1 = require("./schemas/user.schema");
const status_schema_1 = require("../status/schemas/status.schema");
let UsersRepository = class UsersRepository extends base_repository_1.BaseRepository {
    userModel;
    statusModel;
    constructor(userModel, statusModel) {
        super(userModel);
        this.userModel = userModel;
        this.statusModel = statusModel;
    }
    async findById(id) {
        return this.userModel.findById(id).exec();
    }
    async findByPhoneNumber(phoneNumber) {
        return this.findOne({ phoneNumber });
    }
    async findByPhoneNumbers(phoneNumbers) {
        return this.userModel
            .find({ phoneNumber: { $in: phoneNumbers } })
            .select('_id name phoneNumber avatarUrl isOnline updatedAt')
            .lean()
            .exec();
    }
    async getTranslationBalanceSeconds(userId) {
        const user = await this.userModel
            .findById(userId)
            .select('subscription.translationSecondsBalance')
            .lean()
            .exec();
        return user?.subscription?.translationSecondsBalance ?? 0;
    }
    async getTranslationSubscriptionInfo(userId) {
        const user = await this.userModel
            .findById(userId)
            .select('subscription.translationSecondsBalance subscription.tier subscription.status')
            .lean()
            .exec();
        return {
            translationSecondsBalance: user?.subscription?.translationSecondsBalance ?? 0,
            tier: user?.subscription?.tier ?? user_schema_1.SubscriptionTier.FREE,
            status: user?.subscription?.status ?? user_schema_1.SubscriptionStatus.ACTIVE,
        };
    }
    async decrementTranslationBalance(userId, seconds) {
        if (seconds <= 0) {
            return this.getTranslationBalanceSeconds(userId);
        }
        const decremented = await this.userModel
            .findOneAndUpdate({
            _id: userId,
            'subscription.translationSecondsBalance': { $gte: seconds },
        }, { $inc: { 'subscription.translationSecondsBalance': -seconds } }, { new: true })
            .select('subscription.translationSecondsBalance')
            .lean()
            .exec();
        if (decremented) {
            return decremented.subscription.translationSecondsBalance;
        }
        const clamped = await this.userModel
            .findByIdAndUpdate(userId, { $set: { 'subscription.translationSecondsBalance': 0 } }, { new: true })
            .select('subscription.translationSecondsBalance')
            .lean()
            .exec();
        return clamped?.subscription?.translationSecondsBalance ?? 0;
    }
    async findManyByIds(ids) {
        return this.userModel
            .find({ _id: { $in: ids.map((id) => new mongoose_2.Types.ObjectId(id)) } })
            .select('_id name phoneNumber avatarUrl isOnline location locationUpdatedAt isGhostMode isSharingLocation')
            .lean()
            .exec();
    }
    async findMutualContactIds(userId) {
        const user = await this.userModel
            .findById(userId)
            .select('phoneNumber syncedContacts')
            .lean()
            .exec();
        if (!user || !user.syncedContacts?.length)
            return [];
        const mutuals = await this.userModel
            .find({
            _id: { $ne: new mongoose_2.Types.ObjectId(userId) },
            phoneNumber: { $in: user.syncedContacts },
            syncedContacts: user.phoneNumber,
        })
            .select('_id')
            .lean()
            .exec();
        return mutuals.map((m) => m._id);
    }
    async getNearbyUsers(userId, lng, lat, maxDistanceKm, allowedUserIds) {
        if (!allowedUserIds.length)
            return [];
        const maxDistanceMeters = maxDistanceKm * 1000;
        const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const users = await this.userModel
            .find({
            _id: {
                $ne: userId,
                $in: allowedUserIds.map((id) => new mongoose_2.Types.ObjectId(id)),
            },
            isGhostMode: { $ne: true },
            isSharingLocation: true,
            locationUpdatedAt: { $gte: staleBefore },
            location: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat],
                    },
                    $maxDistance: maxDistanceMeters,
                },
            },
        })
            .select('_id name phoneNumber avatarUrl location isOnline locationUpdatedAt')
            .lean()
            .exec();
        if (!users.length)
            return users;
        const activeStatuses = await this.statusModel
            .find({
            authorId: { $in: users.map((u) => u._id) },
            privacy: status_schema_1.StatusPrivacy.SHOW_ON_MAP,
            expiresAt: { $gt: new Date() },
        })
            .select('authorId')
            .lean()
            .exec();
        const authorsWithStatus = new Set(activeStatuses.map((s) => s.authorId.toString()));
        return users.map((u) => ({
            ...u,
            hasActiveStatus: authorsWithStatus.has(u._id.toString()),
        }));
    }
};
exports.UsersRepository = UsersRepository;
exports.UsersRepository = UsersRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(status_schema_1.Status.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], UsersRepository);
//# sourceMappingURL=users.repository.js.map