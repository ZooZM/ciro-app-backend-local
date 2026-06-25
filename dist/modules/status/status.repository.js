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
exports.StatusRepository = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const base_repository_1 = require("../../common/repositories/base.repository");
const users_repository_1 = require("../users/users.repository");
const status_schema_1 = require("./schemas/status.schema");
let StatusRepository = class StatusRepository extends base_repository_1.BaseRepository {
    statusModel;
    usersRepository;
    constructor(statusModel, usersRepository) {
        super(statusModel);
        this.statusModel = statusModel;
        this.usersRepository = usersRepository;
    }
    async findByClientStatusId(clientStatusId) {
        return this.findOne({ clientStatusId });
    }
    async findActiveById(statusId) {
        return this.statusModel
            .findOne({ _id: statusId, expiresAt: { $gt: new Date() } })
            .exec();
    }
    async findFeedForUser(userId) {
        const mutualContactIds = await this.usersRepository.findMutualContactIds(userId);
        const userObjectId = new mongoose_2.Types.ObjectId(userId);
        return this.statusModel
            .find({
            expiresAt: { $gt: new Date() },
            $or: [
                { authorId: userObjectId },
                {
                    privacy: { $in: [status_schema_1.StatusPrivacy.PUBLIC, status_schema_1.StatusPrivacy.SHOW_ON_MAP] },
                    authorId: { $in: mutualContactIds },
                },
                { privacy: status_schema_1.StatusPrivacy.PRIVATE, audience: userObjectId },
            ],
        })
            .sort({ createdAt: -1 })
            .populate('authorId', 'name avatarUrl')
            .exec();
    }
    async findViewersByStatusId(statusId) {
        return this.statusModel
            .findOne({ _id: statusId, expiresAt: { $gt: new Date() } })
            .populate('views.userId', 'name avatarUrl')
            .exec();
    }
    async findReactionsByStatusId(statusId) {
        return this.statusModel
            .findOne({ _id: statusId, expiresAt: { $gt: new Date() } })
            .populate('reactions.userId', 'name avatarUrl')
            .exec();
    }
    async upsertView(statusId, userId, viewedAt) {
        return this.statusModel
            .findOneAndUpdate({
            _id: statusId,
            'views.userId': { $ne: new mongoose_2.Types.ObjectId(userId) },
        }, { $push: { views: { userId: new mongoose_2.Types.ObjectId(userId), viewedAt } } }, { new: true })
            .exec();
    }
    async upsertReaction(statusId, userId, reaction, createdAt) {
        const userObjectId = new mongoose_2.Types.ObjectId(userId);
        const updated = await this.statusModel
            .findOneAndUpdate({ _id: statusId, 'reactions.userId': userObjectId }, {
            $set: {
                'reactions.$.reaction': reaction,
                'reactions.$.createdAt': createdAt,
            },
        }, { new: true })
            .exec();
        if (updated)
            return updated;
        return this.statusModel
            .findOneAndUpdate({ _id: statusId }, {
            $push: { reactions: { userId: userObjectId, reaction, createdAt } },
        }, { new: true })
            .exec();
    }
    isAudienceSubsetOfMutualContacts(audience, mutualContactIds) {
        const mutualSet = new Set(mutualContactIds.map((id) => id.toString()));
        return audience.every((id) => mutualSet.has(id));
    }
};
exports.StatusRepository = StatusRepository;
exports.StatusRepository = StatusRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(status_schema_1.Status.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        users_repository_1.UsersRepository])
], StatusRepository);
//# sourceMappingURL=status.repository.js.map