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
exports.TranslationController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const users_repository_1 = require("../users/users.repository");
const translation_usage_repository_1 = require("./repositories/translation-usage.repository");
const translation_config_1 = require("./translation.config");
let TranslationController = class TranslationController {
    usersRepository;
    translationUsageRepository;
    config;
    constructor(usersRepository, translationUsageRepository, config) {
        this.usersRepository = usersRepository;
        this.translationUsageRepository = translationUsageRepository;
        this.config = config;
    }
    async getBalance(req) {
        const subscription = await this.usersRepository.getTranslationSubscriptionInfo(req.user.userId);
        return {
            remainingSeconds: subscription.translationSecondsBalance,
            remainingMinutes: Math.floor(subscription.translationSecondsBalance / 60),
            tier: subscription.tier,
            status: subscription.status,
            lowBalanceThresholdSeconds: this.config.lowBalanceSeconds,
        };
    }
    async getActiveSessions(req) {
        const sessions = await this.translationUsageRepository.findActiveSessions(req.user.userId);
        return sessions.map((session) => ({
            roomId: session.roomId,
            speakerId: session.speakerId,
            targetLanguage: session.targetLanguage,
            startedAt: session.startedAt,
            secondsConsumed: session.secondsConsumed,
        }));
    }
};
exports.TranslationController = TranslationController;
__decorate([
    (0, common_1.Get)('balance'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TranslationController.prototype, "getBalance", null);
__decorate([
    (0, common_1.Get)('sessions/active'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TranslationController.prototype, "getActiveSessions", null);
exports.TranslationController = TranslationController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('translation'),
    __param(2, (0, common_1.Inject)(translation_config_1.TRANSLATION_CONFIG)),
    __metadata("design:paramtypes", [users_repository_1.UsersRepository,
        translation_usage_repository_1.TranslationUsageRepository, Object])
], TranslationController);
//# sourceMappingURL=translation.controller.js.map