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
const reels_repository_1 = require("./reels.repository");
let ReelsService = class ReelsService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    getFeed(viewerId, query) {
        return this.repository.listFeed({
            viewerId,
            cursor: query.cursor,
            limit: query.limit ?? 10,
            creatorId: query.creatorId,
        });
    }
    async getReel(id, viewerId) {
        const reel = await this.repository.getReel(id, viewerId);
        if (!reel)
            throw new common_1.NotFoundException('Reel not found');
        return reel;
    }
    async toggleLike(id, viewerId) {
        const result = await this.repository.toggleLike(id, viewerId);
        if (!result)
            throw new common_1.NotFoundException('Reel not found');
        return result;
    }
    async getComments(id, query) {
        const result = await this.repository.listComments(id, {
            cursor: query.cursor,
            limit: query.limit ?? 20,
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
        const profile = await this.repository.getProfile(userId, viewerId);
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
        return result;
    }
};
exports.ReelsService = ReelsService;
exports.ReelsService = ReelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(reels_repository_1.REELS_REPOSITORY)),
    __metadata("design:paramtypes", [Object])
], ReelsService);
//# sourceMappingURL=reels.service.js.map