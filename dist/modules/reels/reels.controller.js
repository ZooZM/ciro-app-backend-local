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
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const crypto_1 = require("crypto");
const music_metadata_1 = require("music-metadata");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const reels_service_1 = require("./reels.service");
const feed_query_dto_1 = require("./dto/feed-query.dto");
const create_comment_dto_1 = require("./dto/create-comment.dto");
const create_reel_dto_1 = require("./dto/create-reel.dto");
const search_query_dto_1 = require("./dto/search-query.dto");
const REELS_UPLOAD_DIR = './uploads/reels';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 61;
let ReelsController = class ReelsController {
    reelsService;
    constructor(reelsService) {
        this.reelsService = reelsService;
    }
    getLiked(req, query) {
        return this.reelsService.getLiked(req.user.userId, query);
    }
    getSaved(req, query) {
        return this.reelsService.getSaved(req.user.userId, query);
    }
    searchReels(req, query) {
        return this.reelsService.searchReels(req.user.userId, query);
    }
    getFeed(req, query) {
        return this.reelsService.getFeed(req.user.userId, query);
    }
    async uploadReel(req, dto, files) {
        const videoFile = files.video?.[0];
        const thumbnailFile = files.thumbnail?.[0];
        if (!videoFile) {
            await this.cleanupFiles([thumbnailFile]);
            throw new common_1.BadRequestException('A video file is required');
        }
        try {
            await this.assertWithinDurationCap(videoFile.path);
        }
        catch (err) {
            await this.cleanupFiles([videoFile, thumbnailFile]);
            throw err;
        }
        return this.reelsService.createReel({
            creatorId: req.user.userId,
            videoUrl: `/uploads/reels/videos/${videoFile.filename}`,
            thumbnailUrl: thumbnailFile
                ? `/uploads/reels/thumbs/${thumbnailFile.filename}`
                : '',
            description: dto.description ?? '',
        });
    }
    deleteReel(req, id) {
        return this.reelsService.deleteReel(id, req.user.userId);
    }
    getReel(req, id) {
        return this.reelsService.getReel(id, req.user.userId);
    }
    toggleLike(req, id) {
        return this.reelsService.toggleLike(id, req.user.userId);
    }
    getComments(req, id, query) {
        return this.reelsService.getComments(id, req.user.userId, query);
    }
    addComment(req, id, dto) {
        return this.reelsService.addComment(id, req.user.userId, dto.text);
    }
    recordShare(req, id) {
        return this.reelsService.recordShare(id, req.user.userId);
    }
    recordView(req, id) {
        return this.reelsService.recordView(id, req.user.userId);
    }
    toggleSave(req, id) {
        return this.reelsService.toggleSave(id, req.user.userId);
    }
    async assertWithinDurationCap(videoPath) {
        let durationSeconds = await this.readMp4DurationSeconds(videoPath);
        if (durationSeconds === undefined) {
            try {
                const meta = await (0, music_metadata_1.parseFile)(videoPath);
                durationSeconds = meta.format.duration;
            }
            catch {
            }
        }
        if (durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
            throw new common_1.BadRequestException('Could not read the video duration');
        }
        if (durationSeconds > MAX_DURATION_SECONDS) {
            throw new common_1.BadRequestException(`Video exceeds the ${MAX_DURATION_SECONDS - 1}-second limit`);
        }
    }
    async readMp4DurationSeconds(videoPath) {
        let fh;
        try {
            fh = await (0, promises_1.open)(videoPath, 'r');
            const { size: fileSize } = await fh.stat();
            const readBox = async (offset, end) => {
                if (offset + 8 > end)
                    return null;
                const header = Buffer.alloc(8);
                await fh.read(header, 0, 8, offset);
                let size = header.readUInt32BE(0);
                const type = header.toString('latin1', 4, 8);
                let headerSize = 8;
                if (size === 1) {
                    const large = Buffer.alloc(8);
                    await fh.read(large, 0, 8, offset + 8);
                    size = large.readUInt32BE(0) * 2 ** 32 + large.readUInt32BE(4);
                    headerSize = 16;
                }
                else if (size === 0) {
                    size = end - offset;
                }
                if (size < headerSize)
                    return null;
                return { size, type, payloadOffset: offset + headerSize };
            };
            const findMvhd = async (start, end) => {
                let offset = start;
                while (offset < end) {
                    const box = await readBox(offset, end);
                    if (!box)
                        break;
                    if (box.type === 'mvhd') {
                        const buf = Buffer.alloc(32);
                        await fh.read(buf, 0, 32, box.payloadOffset);
                        const version = buf.readUInt8(0);
                        const timescale = version === 1 ? buf.readUInt32BE(20) : buf.readUInt32BE(12);
                        const duration = version === 1
                            ? buf.readUInt32BE(24) * 2 ** 32 + buf.readUInt32BE(28)
                            : buf.readUInt32BE(16);
                        return timescale > 0 ? duration / timescale : undefined;
                    }
                    if (box.type === 'moov') {
                        const found = await findMvhd(box.payloadOffset, offset + box.size);
                        if (found !== undefined)
                            return found;
                    }
                    offset += box.size;
                }
                return undefined;
            };
            return await findMvhd(0, fileSize);
        }
        catch {
            return undefined;
        }
        finally {
            await fh?.close();
        }
    }
    async cleanupFiles(files) {
        for (const file of files) {
            if (!file)
                continue;
            try {
                await (0, promises_1.unlink)(file.path);
            }
            catch {
            }
        }
    }
};
exports.ReelsController = ReelsController;
__decorate([
    (0, common_1.Get)('liked'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, feed_query_dto_1.FeedQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "getLiked", null);
__decorate([
    (0, common_1.Get)('saved'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, feed_query_dto_1.FeedQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "getSaved", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, search_query_dto_1.SearchQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "searchReels", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, feed_query_dto_1.FeedQueryDto]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
    ], {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, file, cb) => {
                const sub = file.fieldname === 'thumbnail' ? 'thumbs' : 'videos';
                const dir = `${REELS_UPLOAD_DIR}/${sub}`;
                (0, fs_1.mkdirSync)(dir, { recursive: true });
                cb(null, dir);
            },
            filename: (_req, file, cb) => {
                cb(null, `${(0, crypto_1.randomUUID)()}${(0, path_1.extname)(file.originalname)}`);
            },
        }),
        limits: { fileSize: MAX_VIDEO_BYTES },
        fileFilter: (_req, file, cb) => {
            const allowed = file.fieldname === 'thumbnail'
                ? /^image\/(jpeg|png)$/
                : /^video\/(mp4|quicktime|webm)$/;
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
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_reel_dto_1.CreateReelDto, Object]),
    __metadata("design:returntype", Promise)
], ReelsController.prototype, "uploadReel", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "deleteReel", null);
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
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, feed_query_dto_1.CommentsQueryDto]),
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
__decorate([
    (0, common_1.Post)(':id/view'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "recordView", null);
__decorate([
    (0, common_1.Post)(':id/save'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReelsController.prototype, "toggleSave", null);
exports.ReelsController = ReelsController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('api/reels'),
    __metadata("design:paramtypes", [reels_service_1.ReelsService])
], ReelsController);
//# sourceMappingURL=reels.controller.js.map