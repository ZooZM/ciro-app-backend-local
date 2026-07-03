import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReelsController } from './reels.controller';
import { ReelsUsersController } from './reels-users.controller';
import { ReelsRedirectController } from './reels-redirect.controller';
import { ReelsService } from './reels.service';
import { ReelsDbRepository } from './reels-db.repository';
import { ReelsSeedService } from './reels-seed.service';
import { ReelsNotificationsService } from './reels-notifications.service';
import { REELS_REPOSITORY } from './reels.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Reel, ReelSchema } from './schemas/reel.schema';
import { ReelLike, ReelLikeSchema } from './schemas/reel-like.schema';
import { ReelSave, ReelSaveSchema } from './schemas/reel-save.schema';
import { ReelView, ReelViewSchema } from './schemas/reel-view.schema';
import { ReelShare, ReelShareSchema } from './schemas/reel-share.schema';
import { ReelComment, ReelCommentSchema } from './schemas/reel-comment.schema';
import { Follow, FollowSchema } from './schemas/follow.schema';
import {
  NotificationEvent,
  NotificationEventSchema,
} from './schemas/notification-event.schema';

@Module({
  imports: [
    // Registering the existing `User` schema here too (alongside UsersModule)
    // is a standard, safe NestJS/Mongoose pattern — both modules bind to the
    // same underlying collection/model, keeping ReelsModule self-contained
    // for its own Mongo needs (mirrors the v1 mock store's self-containment).
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Reel.name, schema: ReelSchema },
      { name: ReelLike.name, schema: ReelLikeSchema },
      { name: ReelSave.name, schema: ReelSaveSchema },
      { name: ReelView.name, schema: ReelViewSchema },
      { name: ReelShare.name, schema: ReelShareSchema },
      { name: ReelComment.name, schema: ReelCommentSchema },
      { name: Follow.name, schema: FollowSchema },
      { name: NotificationEvent.name, schema: NotificationEventSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ReelsController, ReelsUsersController, ReelsRedirectController],
  providers: [
    ReelsService,
    ReelsDbRepository,
    ReelsSeedService,
    ReelsNotificationsService,
    { provide: REELS_REPOSITORY, useExisting: ReelsDbRepository },
  ],
})
export class ReelsModule {}
