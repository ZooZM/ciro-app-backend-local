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
exports.ReelsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const reels_service_1 = require("./reels.service");
const feed_query_dto_1 = require("./dto/feed-query.dto");
const create_comment_dto_1 = require("./dto/create-comment.dto");
let ReelsController = class ReelsController {
    reelsService;
    constructor(reelsService) {
        this.reelsService = reelsService;
    }
    getFeed(req, query) {
        return this.reelsService.getFeed(req.user.userId, query);
    }
    getReel(req, id) {
        return this.reelsService.getReel(id, req.user.userId);
    }
    toggleLike(req, id) {
        return this.reelsService.toggleLike(id, req.user.userId);
    }
    getComments(id, query) {
        return this.reelsService.getComments(id, query);
    }
    addComment(req, id, dto) {
        return this.reelsService.addComment(id, req.user.userId, dto.text);
    }
    recordShare(req, id) {
        return this.reelsService.recordShare(id, req.user.userId);
    }
};
exports.ReelsController = ReelsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, feed_query_dto_1.FeedQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "getReel", null);
__decorate([
    (0, common_1.Post)(':id/like'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "toggleLike", null);
__decorate([
    (0, common_1.Get)(':id/comments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, feed_query_dto_1.CommentsQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "getComments", null);
__decorate([
    (0, common_1.Post)(':id/comments'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_comment_dto_1.CreateCommentDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "addComment", null);
__decorate([
    (0, common_1.Post)(':id/share'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "recordShare", null);
exports.ReelsController = ReelsController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('api/reels'),
    __metadata("design:paramtypes", [reels_service_1.ReelsService])
], ReelsController);
//# sourceMappingURL=reels.controller.js.map