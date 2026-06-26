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
exports.StatusController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const status_service_1 = require("./status.service");
const create_status_dto_1 = require("./dto/create-status.dto");
const react_status_dto_1 = require("./dto/react-status.dto");
const reply_status_dto_1 = require("./dto/reply-status.dto");
const STATUS_UPLOAD_DIR = './uploads/status';
let StatusController = class StatusController {
    statusService;
    constructor(statusService) {
        this.statusService = statusService;
    }
    async getFeed(req) {
        return this.statusService.getFeed(req.user.userId);
    }
    async getDefaultAudience(req) {
        return this.statusService.getDefaultAudience(req.user.userId);
    }
    async uploadStatus(req, dto, res, file) {
        const { status, isNew } = await this.statusService.createStatus(req.user.userId, dto, file);
        res.status(isNew ? common_1.HttpStatus.CREATED : common_1.HttpStatus.OK);
        return status;
    }
    async getViewers(req, id) {
        return this.statusService.getViewers(id, req.user.userId);
    }
    async getReactions(req, id) {
        return this.statusService.getReactions(id, req.user.userId);
    }
    async react(req, id, dto) {
        return this.statusService.react(id, req.user.userId, dto);
    }
    async reply(req, id, dto) {
        return this.statusService.reply(id, req.user.userId, dto);
    }
    async getMedia(req, statusId, filename, res) {
        const status = await this.statusService.getStatusForMediaAccess(statusId, req.user.userId);
        const filePath = (0, path_1.join)(process.cwd(), 'uploads', 'status', filename);
        if (!(0, fs_1.existsSync)(filePath))
            throw new common_1.NotFoundException();
        res.set({
            'Content-Type': status.mimeType || 'application/octet-stream',
            'Cache-Control': 'private, max-age=3600',
        });
        res.sendFile(filePath);
    }
};
exports.StatusController = StatusController;
__decorate([
    (0, common_1.Get)('feed'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Get)('audience/default'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "getDefaultAudience", null);
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                (0, fs_1.mkdirSync)(STATUS_UPLOAD_DIR, { recursive: true });
                cb(null, STATUS_UPLOAD_DIR);
            },
            filename: (_req, file, cb) => {
                cb(null, `${(0, crypto_1.randomUUID)()}${(0, path_1.extname)(file.originalname)}`);
            },
        }),
        limits: { fileSize: 20 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const allowed = /^(image|audio|video)\/.+$/;
            if (allowed.test(file.mimetype)) {
                cb(null, true);
            }
            else {
                cb(new common_1.BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
            }
        },
    })),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __param(3, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_status_dto_1.CreateStatusDto, Object, Object]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "uploadStatus", null);
__decorate([
    (0, common_1.Get)(':id/viewers'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "getViewers", null);
__decorate([
    (0, common_1.Get)(':id/reactions'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "getReactions", null);
__decorate([
    (0, common_1.Post)(':id/react'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, react_status_dto_1.ReactStatusDto]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "react", null);
__decorate([
    (0, common_1.Post)(':id/reply'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, reply_status_dto_1.ReplyStatusDto]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "reply", null);
__decorate([
    (0, common_1.Get)('media/:statusId/:filename'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('statusId')),
    __param(2, (0, common_1.Param)('filename')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], StatusController.prototype, "getMedia", null);
exports.StatusController = StatusController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('status'),
    __metadata("design:paramtypes", [status_service_1.StatusService])
], StatusController);
//# sourceMappingURL=status.controller.js.map