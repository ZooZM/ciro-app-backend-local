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
exports.ReelCommentSchema = exports.ReelComment = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ReelComment = class ReelComment {
    videoId;
    authorId;
    text;
    createdAt;
};
exports.ReelComment = ReelComment;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Reel', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ReelComment.prototype, "videoId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ReelComment.prototype, "authorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, maxlength: 500 }),
    __metadata("design:type", String)
], ReelComment.prototype, "text", void 0);
exports.ReelComment = ReelComment = __decorate([
    (0, mongoose_1.Schema)({ timestamps: { createdAt: true, updatedAt: false } })
], ReelComment);
exports.ReelCommentSchema = mongoose_1.SchemaFactory.createForClass(ReelComment);
exports.ReelCommentSchema.index({ videoId: 1, createdAt: -1, _id: -1 });
//# sourceMappingURL=reel-comment.schema.js.map