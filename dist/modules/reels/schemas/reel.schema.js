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
exports.ReelSchema = exports.Reel = exports.ReelMentionSchema = exports.ReelMention = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ReelMention = class ReelMention {
    userId;
    username;
};
exports.ReelMention = ReelMention;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ReelMention.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], ReelMention.prototype, "username", void 0);
exports.ReelMention = ReelMention = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], ReelMention);
exports.ReelMentionSchema = mongoose_1.SchemaFactory.createForClass(ReelMention);
let Reel = class Reel {
    creatorId;
    videoUrl;
    thumbnailUrl;
    description;
    hashtags;
    mentions;
    viewsCount;
    likesCount;
    commentsCount;
    sharesCount;
    createdAt;
};
exports.Reel = Reel;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Reel.prototype, "creatorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Reel.prototype, "videoUrl", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Reel.prototype, "thumbnailUrl", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: '', maxlength: 2200 }),
    __metadata("design:type", String)
], Reel.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], Reel.prototype, "hashtags", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.ReelMentionSchema], default: [] }),
    __metadata("design:type", Array)
], Reel.prototype, "mentions", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Reel.prototype, "viewsCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Reel.prototype, "likesCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Reel.prototype, "commentsCount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Reel.prototype, "sharesCount", void 0);
exports.Reel = Reel = __decorate([
    (0, mongoose_1.Schema)({ timestamps: { createdAt: true, updatedAt: false } })
], Reel);
exports.ReelSchema = mongoose_1.SchemaFactory.createForClass(Reel);
exports.ReelSchema.index({ createdAt: -1, _id: -1 });
exports.ReelSchema.index({ creatorId: 1, createdAt: -1 });
exports.ReelSchema.index({ hashtags: 1, createdAt: -1 });
//# sourceMappingURL=reel.schema.js.map