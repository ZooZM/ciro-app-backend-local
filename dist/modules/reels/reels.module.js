"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReelsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const reels_controller_1 = require("./reels.controller");
const reels_users_controller_1 = require("./reels-users.controller");
const reels_redirect_controller_1 = require("./reels-redirect.controller");
const reels_service_1 = require("./reels.service");
const reels_db_repository_1 = require("./reels-db.repository");
const reels_seed_service_1 = require("./reels-seed.service");
const reels_notifications_service_1 = require("./reels-notifications.service");
const reels_repository_1 = require("./reels.repository");
const notifications_module_1 = require("../notifications/notifications.module");
const user_schema_1 = require("../users/schemas/user.schema");
const reel_schema_1 = require("./schemas/reel.schema");
const reel_like_schema_1 = require("./schemas/reel-like.schema");
const reel_save_schema_1 = require("./schemas/reel-save.schema");
const reel_view_schema_1 = require("./schemas/reel-view.schema");
const reel_share_schema_1 = require("./schemas/reel-share.schema");
const reel_comment_schema_1 = require("./schemas/reel-comment.schema");
const follow_schema_1 = require("./schemas/follow.schema");
const notification_event_schema_1 = require("./schemas/notification-event.schema");
let ReelsModule = class ReelsModule {
};
exports.ReelsModule = ReelsModule;
exports.ReelsModule = ReelsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: reel_schema_1.Reel.name, schema: reel_schema_1.ReelSchema },
                { name: reel_like_schema_1.ReelLike.name, schema: reel_like_schema_1.ReelLikeSchema },
                { name: reel_save_schema_1.ReelSave.name, schema: reel_save_schema_1.ReelSaveSchema },
                { name: reel_view_schema_1.ReelView.name, schema: reel_view_schema_1.ReelViewSchema },
                { name: reel_share_schema_1.ReelShare.name, schema: reel_share_schema_1.ReelShareSchema },
                { name: reel_comment_schema_1.ReelComment.name, schema: reel_comment_schema_1.ReelCommentSchema },
                { name: follow_schema_1.Follow.name, schema: follow_schema_1.FollowSchema },
                { name: notification_event_schema_1.NotificationEvent.name, schema: notification_event_schema_1.NotificationEventSchema },
            ]),
            notifications_module_1.NotificationsModule,
        ],
        controllers: [reels_controller_1.ReelsController, reels_users_controller_1.ReelsUsersController, reels_redirect_controller_1.ReelsRedirectController],
        providers: [
            reels_service_1.ReelsService,
            reels_db_repository_1.ReelsDbRepository,
            reels_seed_service_1.ReelsSeedService,
            reels_notifications_service_1.ReelsNotificationsService,
            { provide: reels_repository_1.REELS_REPOSITORY, useExisting: reels_db_repository_1.ReelsDbRepository },
        ],
    })
], ReelsModule);
//# sourceMappingURL=reels.module.js.map