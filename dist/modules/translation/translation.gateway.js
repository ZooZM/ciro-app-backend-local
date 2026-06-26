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
var TranslationGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const jwt_1 = require("@nestjs/jwt");
const chat_rooms_repository_1 = require("../chat/chat-rooms.repository");
const subscribe_translation_dto_1 = require("./dto/subscribe-translation.dto");
const change_target_language_dto_1 = require("./dto/change-target-language.dto");
const unsubscribe_translation_dto_1 = require("./dto/unsubscribe-translation.dto");
const translation_manager_service_1 = require("./services/translation-manager.service");
const translation_usage_schema_1 = require("./schemas/translation-usage.schema");
let TranslationGateway = TranslationGateway_1 = class TranslationGateway {
    jwtService;
    chatRoomsRepository;
    translationManagerService;
    server;
    logger = new common_1.Logger(TranslationGateway_1.name);
    constructor(jwtService, chatRoomsRepository, translationManagerService) {
        this.jwtService = jwtService;
        this.chatRoomsRepository = chatRoomsRepository;
        this.translationManagerService = translationManagerService;
        this.translationManagerService.setEventHandler(this);
    }
    async handleConnection(client) {
        try {
            const authHeader = client.handshake.headers.authorization;
            const queryToken = client.handshake.query.token;
            const authObjectToken = client.handshake.auth?.token;
            let token = queryToken || authObjectToken;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
            if (!token)
                throw new Error('Missing token');
            const payload = await this.jwtService.verifyAsync(token);
            client.user = { userId: payload.sub, phoneNumber: payload.phoneNumber };
            await client.join(`user:${client.user.userId}`);
            this.logger.log(`[WS CONNECTED] User: ${client.user.userId} | Socket: ${client.id}`);
        }
        catch {
            this.logger.warn(`[WS REJECTED] Socket: ${client.id} | Invalid or missing token`);
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        if (!client.user || !client.translationSubscriptions)
            return;
        const userId = client.user.userId;
        for (const key of client.translationSubscriptions) {
            const [roomId, speakerId] = key.split(':');
            await this.translationManagerService.unsubscribe(roomId, speakerId, userId, translation_usage_schema_1.TranslationUsageEndReason.LEFT_CALL);
        }
        client.translationSubscriptions.clear();
    }
    async assertRoomMember(userId, roomId) {
        const room = await this.chatRoomsRepository.findOne({
            _id: roomId,
            participants: userId,
        });
        return room !== null;
    }
    subscriptionKey(roomId, speakerId) {
        return `${roomId}:${speakerId}`;
    }
    async handleSubscribe(client, payload) {
        await this.handleSubscribeRequest(client, payload.roomId, payload.speakerId, payload.targetLanguage);
    }
    async handleChangeLanguage(client, payload) {
        await this.handleSubscribeRequest(client, payload.roomId, payload.speakerId, payload.targetLanguage);
    }
    async handleUnsubscribe(client, payload) {
        if (!client.user)
            return;
        await this.translationManagerService.unsubscribe(payload.roomId, payload.speakerId, client.user.userId);
        client.translationSubscriptions?.delete(this.subscriptionKey(payload.roomId, payload.speakerId));
        client.emit('translation:unsubscribed', {
            roomId: payload.roomId,
            speakerId: payload.speakerId,
        });
    }
    async handleSubscribeRequest(client, roomId, speakerId, targetLanguage) {
        if (!client.user) {
            client.emit('translation:denied', {
                roomId,
                speakerId,
                reason: 'unauthenticated',
            });
            return;
        }
        const isMember = await this.assertRoomMember(client.user.userId, roomId);
        if (!isMember) {
            client.emit('translation:denied', {
                roomId,
                speakerId,
                reason: 'not_a_participant',
            });
            return;
        }
        const result = await this.translationManagerService.subscribe(roomId, speakerId, client.user.userId, targetLanguage);
        switch (result.status) {
            case 'subscribed':
                (client.translationSubscriptions ??= new Set()).add(this.subscriptionKey(roomId, speakerId));
                client.emit('translation:subscribed', {
                    roomId,
                    speakerId,
                    targetLanguage: result.targetLanguage,
                    remainingSeconds: result.remainingSeconds,
                });
                break;
            case 'denied':
                client.emit('translation:denied', {
                    roomId,
                    speakerId,
                    reason: result.reason,
                });
                break;
            case 'unavailable':
                client.emit('translation_unavailable', {
                    roomId,
                    speakerId,
                    reason: result.reason,
                    transient: result.transient,
                });
                break;
        }
    }
    onTranslationUnavailable(listenerId, event) {
        this.server.to(`user:${listenerId}`).emit('translation_unavailable', event);
    }
    onCreditsLow(listenerId, event) {
        this.server.to(`user:${listenerId}`).emit('credits_low', event);
    }
    onCreditsExhausted(listenerId, event) {
        this.server.to(`user:${listenerId}`).emit('credits_exhausted', event);
    }
};
exports.TranslationGateway = TranslationGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], TranslationGateway.prototype, "server", void 0);
__decorate([
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    (0, websockets_1.SubscribeMessage)('translation:subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, subscribe_translation_dto_1.SubscribeTranslationDto]),
    __metadata("design:returntype", Promise)
], TranslationGateway.prototype, "handleSubscribe", null);
__decorate([
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    (0, websockets_1.SubscribeMessage)('translation:changeLanguage'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_target_language_dto_1.ChangeTargetLanguageDto]),
    __metadata("design:returntype", Promise)
], TranslationGateway.prototype, "handleChangeLanguage", null);
__decorate([
    (0, common_1.UsePipes)(new common_1.ValidationPipe({ transform: true, whitelist: true })),
    (0, websockets_1.SubscribeMessage)('translation:unsubscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, unsubscribe_translation_dto_1.UnsubscribeTranslationDto]),
    __metadata("design:returntype", Promise)
], TranslationGateway.prototype, "handleUnsubscribe", null);
exports.TranslationGateway = TranslationGateway = TranslationGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: '*' },
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        chat_rooms_repository_1.ChatRoomsRepository,
        translation_manager_service_1.TranslationManagerService])
], TranslationGateway);
//# sourceMappingURL=translation.gateway.js.map