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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationUsageSchema = exports.TranslationUsage = exports.TranslationUsageEndReason = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var TranslationUsageEndReason;
(function (TranslationUsageEndReason) {
    TranslationUsageEndReason["USER_UNSUBSCRIBED"] = "user_unsubscribed";
    TranslationUsageEndReason["CREDITS_EXHAUSTED"] = "credits_exhausted";
    TranslationUsageEndReason["LEFT_CALL"] = "left_call";
    TranslationUsageEndReason["SERVICE_ERROR"] = "service_error";
    TranslationUsageEndReason["PIPELINE_TORN_DOWN"] = "pipeline_torn_down";
})(TranslationUsageEndReason || (exports.TranslationUsageEndReason = TranslationUsageEndReason = {}));
let TranslationUsage = class TranslationUsage {
    listenerId;
    roomId;
    speakerId;
    targetLanguage;
    detectedSourceLanguages;
    secondsConsumed;
    interimCount;
    finalCount;
    endReason;
    startedAt;
    endedAt;
};
exports.TranslationUsage = TranslationUsage;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TranslationUsage.prototype, "listenerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true, index: true }),
    __metadata("design:type", String)
], TranslationUsage.prototype, "roomId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], TranslationUsage.prototype, "speakerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], TranslationUsage.prototype, "targetLanguage", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], TranslationUsage.prototype, "detectedSourceLanguages", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0, min: 0 }),
    __metadata("design:type", Number)
], TranslationUsage.prototype, "secondsConsumed", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0, min: 0 }),
    __metadata("design:type", Number)
], TranslationUsage.prototype, "interimCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0, min: 0 }),
    __metadata("design:type", Number)
], TranslationUsage.prototype, "finalCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(TranslationUsageEndReason),
        required: false,
    }),
    __metadata("design:type", String)
], TranslationUsage.prototype, "endReason", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: true }),
    __metadata("design:type", Date)
], TranslationUsage.prototype, "startedAt", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: false }),
    __metadata("design:type", Date)
], TranslationUsage.prototype, "endedAt", void 0);
exports.TranslationUsage = TranslationUsage = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], TranslationUsage);
exports.TranslationUsageSchema = mongoose_1.SchemaFactory.createForClass(TranslationUsage);
exports.TranslationUsageSchema.index({ listenerId: 1, startedAt: -1 });
exports.TranslationUsageSchema.index({ roomId: 1 });
//# sourceMappingURL=translation-usage.schema.js.map