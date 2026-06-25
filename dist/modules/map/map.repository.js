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
exports.MapRepository = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../users/schemas/user.schema");
const chat_room_schema_1 = require("../chat/schemas/chat-room.schema");
const status_schema_1 = require("../status/schemas/status.schema");
let MapRepository = class MapRepository {
    userModel;
    chatRoomModel;
    statusModel;
    constructor(userModel, chatRoomModel, statusModel) {
        this.userModel = userModel;
        this.chatRoomModel = chatRoomModel;
        this.statusModel = statusModel;
    }
    async getSharedRoomParticipantIds(userId) {
        const objectId = new mongoose_2.Types.ObjectId(userId);
        const rooms = await this.chatRoomModel
            .find({ participants: objectId })
            .select('participants')
            .lean()
            .exec();
        const ids = new Set();
        for (const room of rooms) {
            for (const participant of room.participants) {
                const id = participant.toString();
                if (id !== userId)
                    ids.add(id);
            }
        }
        return Array.from(ids);
    }
    async getUsersWhoBlocked(userId) {
        const objectId = new mongoose_2.Types.ObjectId(userId);
        const blockers = await this.userModel
            .find({ blockedUsers: objectId })
            .select('_id')
            .lean()
            .exec();
        return blockers.map((u) => u._id.toString());
    }
    async getGroupRoomsForUser(userId) {
        const objectId = new mongoose_2.Types.ObjectId(userId);
        return this.chatRoomModel
            .find({ participants: objectId, type: chat_room_schema_1.ChatRoomType.GROUP })
            .select('name avatarUrl participants')
            .lean()
            .exec();
    }
    async getSharedGroupIdsByMember(viewerId) {
        const groups = await this.getGroupRoomsForUser(viewerId);
        const map = new Map();
        for (const room of groups) {
            const roomId = room._id.toString();
            for (const participant of room.participants) {
                const memberId = participant.toString();
                if (memberId === viewerId)
                    continue;
                const existing = map.get(memberId) ?? [];
                existing.push(roomId);
                map.set(memberId, existing);
            }
        }
        return map;
    }
    async getActiveShowOnMapAuthorIds() {
        const statuses = await this.statusModel
            .find({ privacy: status_schema_1.StatusPrivacy.SHOW_ON_MAP, expiresAt: { $gt: new Date() } })
            .select('authorId')
            .lean()
            .exec();
        const ids = new Set(statuses.map((s) => s.authorId.toString()));
        return Array.from(ids);
    }
};
exports.MapRepository = MapRepository;
exports.MapRepository = MapRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __param(1, (0, mongoose_1.InjectModel)(chat_room_schema_1.ChatRoom.name)),
    __param(2, (0, mongoose_1.InjectModel)(status_schema_1.Status.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], MapRepository);
//# sourceMappingURL=map.repository.js.map