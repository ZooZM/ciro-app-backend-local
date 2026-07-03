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
exports.StatusService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("mongoose");
const crypto_1 = require("crypto");
const status_repository_1 = require("./status.repository");
const users_repository_1 = require("../users/users.repository");
const chat_service_1 = require("../chat/chat.service");
const chat_gateway_1 = require("../chat/chat.gateway");
const map_service_1 = require("../map/map.service");
const push_service_1 = require("../notifications/push.service");
const message_schema_1 = require("../chat/schemas/message.schema");
const status_schema_1 = require("./schemas/status.schema");
let StatusService = class StatusService {
    statusRepository;
    usersRepository;
    chatService;
    chatGateway;
    pushService;
    constructor(statusRepository, usersRepository, chatService, chatGateway, pushService) {
        this.statusRepository = statusRepository;
        this.usersRepository = usersRepository;
        this.chatService = chatService;
        this.chatGateway = chatGateway;
        this.pushService = pushService;
    }
    async createStatus(userId, dto, file) {
        const existing = await this.statusRepository.findByClientStatusId(dto.clientStatusId);
        if (existing) {
            await existing.populate('authorId', 'name avatarUrl');
            return { status: this.toStatusJson(existing, userId), isNew: false };
        }
        if (dto.contentType === status_schema_1.StatusContentType.TEXT) {
            if (!dto.textContent) {
                throw new common_1.BadRequestException('textContent is required for text statuses');
            }
        }
        else if (!file) {
            throw new common_1.BadRequestException('A media file is required for this content type');
        }
        let audience = [];
        if (dto.privacy === status_schema_1.StatusPrivacy.PRIVATE) {
            if (!dto.audience?.length) {
                throw new common_1.BadRequestException('audience is required for private statuses');
            }
            const mutualContactIds = await this.usersRepository.findMutualContactIds(userId);
            if (!this.statusRepository.isAudienceSubsetOfMutualContacts(dto.audience, mutualContactIds)) {
                throw new common_1.BadRequestException('audience must be a subset of mutual contacts');
            }
            audience = dto.audience.map((id) => new mongoose_1.Types.ObjectId(id));
        }
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const _id = new mongoose_1.Types.ObjectId();
        const mediaUrl = file
            ? `/status/media/${_id.toString()}/${file.filename}`
            : undefined;
        const created = await this.statusRepository.create({
            _id,
            authorId: new mongoose_1.Types.ObjectId(userId),
            clientStatusId: dto.clientStatusId,
            contentType: dto.contentType,
            textContent: dto.textContent,
            mediaUrl,
            mimeType: file?.mimetype,
            backgroundColor: dto.backgroundColor,
            fontStyle: dto.fontStyle,
            musicTrackId: dto.musicTrackId,
            caption: dto.caption,
            privacy: dto.privacy,
            audience,
            expiresAt,
        });
        if (dto.privacy === status_schema_1.StatusPrivacy.PRIVATE) {
            await this.usersRepository.updateOne({ _id: userId }, {
                $set: { defaultStatusAudience: audience },
            });
        }
        await created.populate('authorId', 'name avatarUrl');
        await this.fanOutStatusReceived(created);
        if (dto.privacy === status_schema_1.StatusPrivacy.SHOW_ON_MAP) {
            if (dto.longitude !== undefined && dto.latitude !== undefined) {
                await this.usersRepository.updateOne({ _id: userId }, {
                    $set: {
                        location: {
                            type: 'Point',
                            coordinates: [dto.longitude, dto.latitude],
                        },
                        locationUpdatedAt: new Date(),
                        isSharingLocation: true,
                    },
                });
            }
            await this.broadcastExploreStatusAdded(userId);
        }
        return { status: this.toStatusJson(created, userId), isNew: true };
    }
    async broadcastExploreStatusAdded(authorId) {
        const author = await this.usersRepository.findById(authorId);
        if (!author?.location?.coordinates)
            return;
        const [lng, lat] = author.location.coordinates;
        this.chatGateway.server.emit('exploreStatusAdded', {
            _id: authorId,
            name: author.name,
            phoneNumber: author.phoneNumber,
            avatarUrl: author.avatarUrl,
            isOnline: author.isOnline === true,
            location: {
                type: 'Point',
                coordinates: [(0, map_service_1.coarsen)(lng), (0, map_service_1.coarsen)(lat)],
            },
            locationUpdatedAt: (author.locationUpdatedAt ?? new Date()).toISOString(),
            sharedGroupIds: [],
            isCoarse: true,
            hasActiveStatus: true,
        });
    }
    async getFeed(userId) {
        const statuses = await this.statusRepository.findFeedForUser(userId);
        return statuses.map((status) => this.toStatusJson(status, userId));
    }
    async getViewers(statusId, userId) {
        const status = await this.statusRepository.findActiveById(statusId);
        if (!status)
            throw new common_1.NotFoundException('Status not found');
        if (status.authorId.toString() !== userId)
            throw new common_1.ForbiddenException();
        const populated = await this.statusRepository.findViewersByStatusId(statusId);
        return (populated?.views ?? []).map((view) => {
            const viewer = view.userId;
            return {
                userId: viewer?._id ? viewer._id.toString() : viewer.toString(),
                name: viewer?.name ?? '',
                avatarUrl: viewer?.avatarUrl ?? '',
                viewedAt: view.viewedAt,
            };
        });
    }
    async getReactions(statusId, userId) {
        const status = await this.statusRepository.findActiveById(statusId);
        if (!status)
            throw new common_1.NotFoundException('Status not found');
        if (status.authorId.toString() !== userId)
            throw new common_1.ForbiddenException();
        const populated = await this.statusRepository.findReactionsByStatusId(statusId);
        return (populated?.reactions ?? []).map((r) => {
            const reactor = r.userId;
            return {
                userId: reactor?._id ? reactor._id.toString() : reactor.toString(),
                reaction: r.reaction,
                createdAt: r.createdAt,
            };
        });
    }
    async recordView(statusId, viewerId) {
        const status = await this.statusRepository.findActiveById(statusId);
        if (!status)
            return;
        if (status.authorId.toString() === viewerId)
            return;
        const viewedAt = new Date();
        const updated = await this.statusRepository.upsertView(statusId, viewerId, viewedAt);
        if (!updated)
            return;
        const viewer = await this.usersRepository.findById(viewerId);
        this.chatGateway.server
            .to(`user:${status.authorId.toString()}`)
            .emit('statusViewerAdded', {
            statusId,
            viewer: {
                userId: viewerId,
                name: viewer?.name ?? '',
                avatarUrl: viewer?.avatarUrl ?? '',
            },
            viewedAt,
        });
    }
    async react(statusId, userId, dto) {
        const status = await this.checkVisibilityOrThrow(statusId, userId);
        const createdAt = new Date();
        await this.statusRepository.upsertReaction(statusId, userId, dto.reaction, createdAt);
        if (status.authorId.toString() !== userId) {
            const reactor = await this.usersRepository.findById(userId);
            const reactorName = reactor?.name ?? '';
            this.chatGateway.server
                .to(`user:${status.authorId.toString()}`)
                .emit('statusReacted', {
                statusId,
                reaction: dto.reaction,
                from: {
                    userId,
                    name: reactorName,
                    avatarUrl: reactor?.avatarUrl ?? '',
                },
                createdAt,
            });
            await this.pushService.notifyStatusReaction(status.authorId.toString(), {
                reactorName,
                statusId,
            });
        }
        return { statusId, reaction: dto.reaction };
    }
    async reply(statusId, userId, dto) {
        const status = await this.checkVisibilityOrThrow(statusId, userId);
        const authorId = status.authorId.toString();
        const { roomId } = await this.chatService.resolvePrivateRoom(userId, authorId);
        const { message } = await this.chatService.saveMessage(userId, {
            chatRoomId: roomId,
            content: dto.message,
            clientMessageId: (0, crypto_1.randomUUID)(),
            type: message_schema_1.MessageType.TEXT,
        }, {
            statusRef: {
                statusId: status._id,
                statusAuthorId: status.authorId,
                expiresAt: status.expiresAt,
            },
        });
        this.chatGateway.server
            .to(roomId)
            .to(`user:${authorId}`)
            .emit('newMessage', message);
        return message;
    }
    async getDefaultAudience(userId) {
        const user = await this.usersRepository.findById(userId);
        if (!user?.defaultStatusAudience?.length)
            return [];
        const mutualContactIds = await this.usersRepository.findMutualContactIds(userId);
        const mutualSet = new Set(mutualContactIds.map((id) => id.toString()));
        const validIds = user.defaultStatusAudience
            .map((id) => id.toString())
            .filter((id) => mutualSet.has(id));
        if (!validIds.length)
            return [];
        const audienceUsers = await this.usersRepository.find({
            _id: { $in: validIds },
        });
        return audienceUsers.map((u) => ({
            userId: u._id.toString(),
            name: u.name,
            phoneNumber: u.phoneNumber,
            avatarUrl: u.avatarUrl ?? '',
        }));
    }
    async getStatusForMediaAccess(statusId, userId) {
        const status = await this.statusRepository.findActiveById(statusId);
        if (!status)
            throw new common_1.NotFoundException();
        if (!(await this.isPermittedToView(status, userId))) {
            throw new common_1.NotFoundException();
        }
        return status;
    }
    async checkVisibilityOrThrow(statusId, userId) {
        const status = await this.statusRepository.findActiveById(statusId);
        if (!status)
            throw new common_1.NotFoundException('Status not found');
        if (!(await this.isPermittedToView(status, userId))) {
            throw new common_1.ForbiddenException('Not permitted to view this status');
        }
        return status;
    }
    async isPermittedToView(status, userId) {
        if (status.authorId.toString() === userId)
            return true;
        if (status.privacy === status_schema_1.StatusPrivacy.PRIVATE) {
            return (status.audience ?? []).some((id) => id.toString() === userId);
        }
        const mutualContactIds = await this.usersRepository.findMutualContactIds(status.authorId.toString());
        return mutualContactIds.some((id) => id.toString() === userId);
    }
    async fanOutStatusReceived(status) {
        let recipientIds;
        if (status.privacy === status_schema_1.StatusPrivacy.PRIVATE) {
            recipientIds = (status.audience ?? []).map((id) => id.toString());
        }
        else {
            const author = status.authorId;
            const authorId = author?._id ? author._id.toString() : author.toString();
            const mutualContactIds = await this.usersRepository.findMutualContactIds(authorId);
            recipientIds = mutualContactIds.map((id) => id.toString());
        }
        for (const recipientId of recipientIds) {
            this.chatGateway.server
                .to(`user:${recipientId}`)
                .emit('statusReceived', this.toStatusJson(status, recipientId));
        }
    }
    toStatusJson(status, viewerId) {
        const author = status.authorId;
        const authorIdStr = author?._id ? author._id.toString() : author.toString();
        const isViewed = (status.views ?? []).some((view) => {
            const vid = view.userId?._id
                ? view.userId._id.toString()
                : view.userId.toString();
            return vid === viewerId;
        });
        return {
            id: status._id.toString(),
            authorId: authorIdStr,
            authorName: author?.name ?? '',
            authorAvatar: author?.avatarUrl ?? '',
            clientStatusId: status.clientStatusId,
            contentType: status.contentType,
            textContent: status.textContent ?? null,
            mediaUrl: status.mediaUrl ?? null,
            caption: status.caption ?? null,
            backgroundColor: status.backgroundColor ?? null,
            fontStyle: status.fontStyle ?? null,
            musicTrackId: status.musicTrackId ?? null,
            privacy: status.privacy,
            createdAt: status.createdAt,
            expiresAt: status.expiresAt,
            isViewed,
            isMine: authorIdStr === viewerId,
        };
    }
};
exports.StatusService = StatusService;
exports.StatusService = StatusService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => chat_service_1.ChatService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => chat_gateway_1.ChatGateway))),
    __metadata("design:paramtypes", [status_repository_1.StatusRepository,
        users_repository_1.UsersRepository,
        chat_service_1.ChatService,
        chat_gateway_1.ChatGateway,
        push_service_1.PushService])
], StatusService);
//# sourceMappingURL=status.service.js.map