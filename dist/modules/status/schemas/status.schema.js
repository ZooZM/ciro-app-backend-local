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
exports.StatusSchema = exports.Status = exports.StatusReactionSchema = exports.StatusReaction = exports.StatusViewSchema = exports.StatusView = exports.StatusPrivacy = exports.StatusContentType = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var StatusContentType;
(function (StatusContentType) {
    StatusContentType["TEXT"] = "text";
    StatusContentType["IMAGE"] = "image";
    StatusContentType["VIDEO"] = "video";
    StatusContentType["VOICE"] = "voice";
})(StatusContentType || (exports.StatusContentType = StatusContentType = {}));
var StatusPrivacy;
(function (StatusPrivacy) {
    StatusPrivacy["PUBLIC"] = "public";
    StatusPrivacy["PRIVATE"] = "private";
    StatusPrivacy["SHOW_ON_MAP"] = "showOnMap";
})(StatusPrivacy || (exports.StatusPrivacy = StatusPrivacy = {}));
let StatusView = class StatusView {
    userId;
    viewedAt;
};
exports.StatusView = StatusView;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], StatusView.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: true }),
    __metadata("design:type", Date)
], StatusView.prototype, "viewedAt", void 0);
exports.StatusView = StatusView = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], StatusView);
exports.StatusViewSchema = mongoose_1.SchemaFactory.createForClass(StatusView);
let StatusReaction = class StatusReaction {
    userId;
    reaction;
    createdAt;
};
exports.StatusReaction = StatusReaction;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], StatusReaction.prototype, "userId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], StatusReaction.prototype, "reaction", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: true }),
    __metadata("design:type", Date)
], StatusReaction.prototype, "createdAt", void 0);
exports.StatusReaction = StatusReaction = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], StatusReaction);
exports.StatusReactionSchema = mongoose_1.SchemaFactory.createForClass(StatusReaction);
let Status = class Status {
    authorId;
    clientStatusId;
    contentType;
    textContent;
    mediaUrl;
    mimeType;
    backgroundColor;
    fontStyle;
    musicTrackId;
    caption;
    privacy;
    audience;
    views;
    reactions;
    expiresAt;
};
exports.Status = Status;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Status.prototype, "authorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], Status.prototype, "clientStatusId", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(StatusContentType),
        required: true,
    }),
    __metadata("design:type", String)
], Status.prototype, "contentType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "textContent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "mediaUrl", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "mimeType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "backgroundColor", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "fontStyle", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "musicTrackId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: false }),
    __metadata("design:type", String)
], Status.prototype, "caption", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(StatusPrivacy),
        default: StatusPrivacy.PUBLIC,
    }),
    __metadata("design:type", String)
], Status.prototype, "privacy", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'User' }], default: [] }),
    __metadata("design:type", Array)
], Status.prototype, "audience", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.StatusViewSchema], default: [] }),
    __metadata("design:type", Array)
], Status.prototype, "views", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.StatusReactionSchema], default: [] }),
    __metadata("design:type", Array)
], Status.prototype, "reactions", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: true }),
    __metadata("design:type", Date)
], Status.prototype, "expiresAt", void 0);
exports.Status = Status = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Status);
exports.StatusSchema = mongoose_1.SchemaFactory.createForClass(Status);
exports.StatusSchema.index({ clientStatusId: 1 }, { unique: true });
exports.StatusSchema.index({ authorId: 1, createdAt: -1 });
exports.StatusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
exports.StatusSchema.index({ privacy: 1, authorId: 1 });
//# sourceMappingURL=status.schema.js.map