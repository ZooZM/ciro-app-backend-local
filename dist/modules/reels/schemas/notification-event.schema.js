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
exports.NotificationEventSchema = exports.NotificationEvent = exports.NotificationEventType = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
var NotificationEventType;
(function (NotificationEventType) {
    NotificationEventType["NEW_FOLLOWER"] = "newFollower";
    NotificationEventType["REEL_LIKE"] = "reelLike";
    NotificationEventType["REEL_MENTION"] = "reelMention";
    NotificationEventType["REEL_REJECTED"] = "reelRejected";
})(NotificationEventType || (exports.NotificationEventType = NotificationEventType = {}));
let NotificationEvent = class NotificationEvent {
    type;
    actorId;
    recipientId;
    reelId;
    createdAt;
};
exports.NotificationEvent = NotificationEvent;
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: NotificationEventType, required: true }),
    __metadata("design:type", String)
], NotificationEvent.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: false, default: null }),
    __metadata("design:type", Object)
], NotificationEvent.prototype, "actorId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], NotificationEvent.prototype, "recipientId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Reel', required: false }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], NotificationEvent.prototype, "reelId", void 0);
exports.NotificationEvent = NotificationEvent = __decorate([
    (0, mongoose_1.Schema)({ timestamps: { createdAt: true, updatedAt: false } })
], NotificationEvent);
exports.NotificationEventSchema = mongoose_1.SchemaFactory.createForClass(NotificationEvent);
exports.NotificationEventSchema.index({ recipientId: 1, createdAt: -1 });
exports.NotificationEventSchema.index({ type: 1, actorId: 1, recipientId: 1, reelId: 1 }, { unique: true });
//# sourceMappingURL=notification-event.schema.js.map