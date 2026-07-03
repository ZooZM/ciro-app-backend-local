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
exports.ReelsUsersController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const reels_service_1 = require("./reels.service");
const search_query_dto_1 = require("./dto/search-query.dto");
let ReelsUsersController = class ReelsUsersController {
    reelsService;
    constructor(reelsService) {
        this.reelsService = reelsService;
    }
    searchUsers(req, query) {
        return this.reelsService.searchUsers(req.user.userId, query);
    }
    getProfile(req, id) {
        return this.reelsService.getProfile(id, req.user.userId);
    }
    toggleFollow(req, id) {
        return this.reelsService.toggleFollow(id, req.user.userId);
    }
    toggleBlock(req, id) {
        return this.reelsService.toggleBlock(id, req.user.userId);
    }
};
exports.ReelsUsersController = ReelsUsersController;
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, search_query_dto_1.SearchQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsUsersController.prototype, "searchUsers", null);
__decorate([
    (0, common_1.Get)(':id/profile'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsUsersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Post)(':id/follow'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsUsersController.prototype, "toggleFollow", null);
__decorate([
    (0, common_1.Post)(':id/block'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsUsersController.prototype, "toggleBlock", null);
exports.ReelsUsersController = ReelsUsersController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('api/users'),
    __metadata("design:paramtypes", [reels_service_1.ReelsService])
], ReelsUsersController);
//# sourceMappingURL=reels-users.controller.js.map