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
exports.MapService = void 0;
exports.coarsen = coarsen;
const common_1 = require("@nestjs/common");
const users_service_1 = require("../users/users.service");
const map_repository_1 = require("./map.repository");
const chat_gateway_1 = require("../chat/chat.gateway");
function coarsen(value) {
    return Math.trunc(value * 100) / 100;
}
let MapService = class MapService {
    usersService;
    mapRepository;
    chatGateway;
    constructor(usersService, mapRepository, chatGateway) {
        this.usersService = usersService;
        this.mapRepository = mapRepository;
        this.chatGateway = chatGateway;
    }
    async updateLocation(userId, lng, lat) {
        return this.usersService.updateLocation(userId, lng, lat);
    }
    async authorizedObserverIds(userId) {
        const [shared, mutuals, blockedByMe, blockedMe] = await Promise.all([
            this.mapRepository.getSharedRoomParticipantIds(userId),
            this.usersService.findMutualContactIds(userId),
            this.usersService.getBlockedUserIds(userId),
            this.mapRepository.getUsersWhoBlocked(userId),
        ]);
        const excluded = new Set([
            ...blockedByMe,
            ...blockedMe.map((id) => id.toString()),
            userId,
        ]);
        const result = new Set();
        for (const id of shared) {
            if (!excluded.has(id))
                result.add(id);
        }
        for (const id of mutuals.map((m) => m.toString())) {
            if (!excluded.has(id))
                result.add(id);
        }
        return result;
    }
    async getVisibleUsers(viewerId) {
        const authorizedIds = Array.from(await this.authorizedObserverIds(viewerId));
        if (!authorizedIds.length)
            return [];
        const [users, sharedGroupIdsByMember] = await Promise.all([
            this.usersService.findManyByIds(authorizedIds),
            this.mapRepository.getSharedGroupIdsByMember(viewerId),
        ]);
        return users
            .filter((u) => u.isGhostMode !== true &&
            u.isSharingLocation === true &&
            u.location?.coordinates)
            .map((u) => this.toMapUserDto(u, sharedGroupIdsByMember));
    }
    async getNearbyUsers(userId, lng, lat, maxDistanceKm) {
        const authorizedIds = Array.from(await this.authorizedObserverIds(userId));
        const sharedGroupIdsByMember = await this.mapRepository.getSharedGroupIdsByMember(userId);
        const users = await this.usersService.getNearbyUsers(userId, lng, lat, maxDistanceKm, authorizedIds);
        return users.map((u) => this.toMapUserDto(u, sharedGroupIdsByMember));
    }
    async getExploreUsers(viewerId) {
        const [authorIds, authorizedIds] = await Promise.all([
            this.mapRepository.getActiveShowOnMapAuthorIds(),
            this.authorizedObserverIds(viewerId),
        ]);
        const candidateIds = authorIds.filter((id) => id !== viewerId);
        if (!candidateIds.length)
            return [];
        const users = await this.usersService.findManyByIds(candidateIds);
        const sharedGroupIdsByMember = await this.mapRepository.getSharedGroupIdsByMember(viewerId);
        return users
            .filter((u) => u.location?.coordinates)
            .map((u) => {
            const isAuthorized = authorizedIds.has(u._id.toString());
            return this.toMapUserDto(u, sharedGroupIdsByMember, !isAuthorized);
        });
    }
    async getGroups(userId) {
        const rooms = await this.mapRepository.getGroupRoomsForUser(userId);
        return rooms.map((room) => ({
            id: room._id.toString(),
            name: room.name ?? 'Group',
            memberCount: room.participants?.length ?? 0,
            avatarUrl: room.avatarUrl ?? null,
            initials: (room.name ?? 'G')
                .split(' ')
                .map((w) => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase(),
        }));
    }
    async setGhostMode(userId, enabled) {
        await this.usersService.setGhostMode(userId, enabled);
        const roomIds = this.chatGateway.getUserRoomIds(userId);
        if (enabled) {
            this.chatGateway.cancelPendingLocationUpdates(userId);
            for (const roomId of roomIds) {
                this.chatGateway.server.to(roomId).emit('locationHidden', { userId });
            }
        }
        else {
            const user = await this.usersService.findById(userId);
            if (user?.location?.coordinates && user.locationUpdatedAt) {
                const [longitude, latitude] = user.location.coordinates;
                for (const roomId of roomIds) {
                    this.chatGateway.server.to(roomId).emit('locationUpdate', {
                        updates: [
                            {
                                userId,
                                longitude,
                                latitude,
                                isOnline: user.isOnline === true,
                                lastUpdatedAt: user.locationUpdatedAt.toISOString(),
                            },
                        ],
                    });
                }
            }
        }
        return { isGhostMode: enabled };
    }
    async getGhostMode(userId) {
        return { isGhostMode: await this.usersService.isGhostMode(userId) };
    }
    toMapUserDto(user, sharedGroupIdsByMember, forceCoarse = false) {
        const id = user._id.toString();
        const [lng, lat] = user.location.coordinates;
        const isCoarse = forceCoarse === true;
        return {
            _id: id,
            name: user.name,
            phoneNumber: user.phoneNumber,
            avatarUrl: user.avatarUrl,
            isOnline: user.isOnline === true,
            location: {
                type: 'Point',
                coordinates: isCoarse ? [coarsen(lng), coarsen(lat)] : [lng, lat],
            },
            locationUpdatedAt: (user.locationUpdatedAt ?? new Date(0)).toISOString
                ? user.locationUpdatedAt.toISOString()
                : new Date(user.locationUpdatedAt ?? 0).toISOString(),
            sharedGroupIds: sharedGroupIdsByMember.get(id) ?? [],
            ...(isCoarse ? { isCoarse: true } : {}),
        };
    }
};
exports.MapService = MapService;
exports.MapService = MapService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => chat_gateway_1.ChatGateway))),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        map_repository_1.MapRepository,
        chat_gateway_1.ChatGateway])
], MapService);
//# sourceMappingURL=map.service.js.map