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
exports.TranslationUsageRepository = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const base_repository_1 = require("../../../common/repositories/base.repository");
const translation_usage_schema_1 = require("../schemas/translation-usage.schema");
let TranslationUsageRepository = class TranslationUsageRepository extends base_repository_1.BaseRepository {
    translationUsageModel;
    constructor(translationUsageModel) {
        super(translationUsageModel);
        this.translationUsageModel = translationUsageModel;
    }
    async startSession(input) {
        return this.create({
            listenerId: new mongoose_2.Types.ObjectId(input.listenerId),
            roomId: input.roomId,
            speakerId: input.speakerId,
            targetLanguage: input.targetLanguage,
            detectedSourceLanguages: [],
            secondsConsumed: 0,
            interimCount: 0,
            finalCount: 0,
            startedAt: new Date(),
        });
    }
    async flushConsumption(sessionId, input) {
        const update = {
            $set: { secondsConsumed: input.secondsConsumed },
        };
        const inc = {};
        if (input.interimDelta)
            inc.interimCount = input.interimDelta;
        if (input.finalDelta)
            inc.finalCount = input.finalDelta;
        if (Object.keys(inc).length > 0)
            update.$inc = inc;
        if (input.detectedSourceLanguage) {
            update.$addToSet = {
                detectedSourceLanguages: input.detectedSourceLanguage,
            };
        }
        await this.updateOne({ _id: new mongoose_2.Types.ObjectId(sessionId) }, update);
    }
    async finalizeSession(sessionId, endReason, secondsConsumed) {
        await this.updateOne({ _id: new mongoose_2.Types.ObjectId(sessionId) }, { $set: { endedAt: new Date(), endReason, secondsConsumed } });
    }
    async findActiveSessions(listenerId) {
        return this.translationUsageModel
            .find({
            listenerId: new mongoose_2.Types.ObjectId(listenerId),
            endedAt: { $exists: false },
        })
            .select('roomId speakerId targetLanguage startedAt secondsConsumed')
            .lean()
            .exec();
    }
};
exports.TranslationUsageRepository = TranslationUsageRepository;
exports.TranslationUsageRepository = TranslationUsageRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(translation_usage_schema_1.TranslationUsage.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TranslationUsageRepository);
//# sourceMappingURL=translation-usage.repository.js.map