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
exports.TranslationStateService = void 0;
const common_1 = require("@nestjs/common");
const OWNER_LOCK_TTL_SECONDS = 60;
let TranslationStateService = class TranslationStateService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    subsKey(roomId, speakerId) {
        return `xlation:subs:${roomId}:${speakerId}`;
    }
    ownerKey(roomId, speakerId) {
        return `xlation:owner:${roomId}:${speakerId}`;
    }
    balanceKey(listenerId, sessionId) {
        return `xlation:balance:${listenerId}:${sessionId}`;
    }
    lowFlagKey(sessionId) {
        return `xlation:lowflag:${sessionId}`;
    }
    async addSubscriber(roomId, speakerId, listenerId, targetLanguage) {
        await this.redis.hset(this.subsKey(roomId, speakerId), listenerId, targetLanguage);
        return this.getRefCount(roomId, speakerId);
    }
    async removeSubscriber(roomId, speakerId, listenerId) {
        await this.redis.hdel(this.subsKey(roomId, speakerId), listenerId);
        return this.getRefCount(roomId, speakerId);
    }
    async getRefCount(roomId, speakerId) {
        return this.redis.hlen(this.subsKey(roomId, speakerId));
    }
    async getSubscribers(roomId, speakerId) {
        return this.redis.hgetall(this.subsKey(roomId, speakerId));
    }
    async deleteSubscriptions(roomId, speakerId) {
        await this.redis.del(this.subsKey(roomId, speakerId));
    }
    async acquireOwnership(roomId, speakerId, instanceId, ttlSeconds = OWNER_LOCK_TTL_SECONDS) {
        const result = await this.redis.set(this.ownerKey(roomId, speakerId), instanceId, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
    async refreshOwnership(roomId, speakerId, ttlSeconds = OWNER_LOCK_TTL_SECONDS) {
        await this.redis.expire(this.ownerKey(roomId, speakerId), ttlSeconds);
    }
    async getOwner(roomId, speakerId) {
        return this.redis.get(this.ownerKey(roomId, speakerId));
    }
    async releaseOwnership(roomId, speakerId, instanceId) {
        const current = await this.redis.get(this.ownerKey(roomId, speakerId));
        if (current === instanceId) {
            await this.redis.del(this.ownerKey(roomId, speakerId));
        }
    }
    async seedBalance(listenerId, sessionId, seconds) {
        await this.redis.set(this.balanceKey(listenerId, sessionId), Math.max(0, Math.floor(seconds)));
    }
    async decrementBalance(listenerId, sessionId, by = 1) {
        const remaining = await this.redis.decrby(this.balanceKey(listenerId, sessionId), by);
        if (remaining < 0) {
            await this.redis.set(this.balanceKey(listenerId, sessionId), 0);
            return 0;
        }
        return remaining;
    }
    async getBalance(listenerId, sessionId) {
        const value = await this.redis.get(this.balanceKey(listenerId, sessionId));
        return value ? parseInt(value, 10) : 0;
    }
    async deleteBalance(listenerId, sessionId) {
        await this.redis.del(this.balanceKey(listenerId, sessionId));
    }
    async markLowBalanceEmitted(sessionId) {
        const result = await this.redis.set(this.lowFlagKey(sessionId), '1', 'NX');
        return result === 'OK';
    }
    async clearLowBalanceFlag(sessionId) {
        await this.redis.del(this.lowFlagKey(sessionId));
    }
};
exports.TranslationStateService = TranslationStateService;
exports.TranslationStateService = TranslationStateService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('REDIS_CLIENT')),
    __metadata("design:paramtypes", [Function])
], TranslationStateService);
//# sourceMappingURL=translation-state.service.js.map