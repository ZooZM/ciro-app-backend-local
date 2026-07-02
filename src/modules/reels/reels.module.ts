import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsUsersController } from './reels-users.controller';
import { ReelsRedirectController } from './reels-redirect.controller';
import { ReelsService } from './reels.service';
import { ReelsMockStore } from './mock/reels-mock.store';
import { REELS_REPOSITORY } from './reels.repository';

@Module({
  controllers: [ReelsController, ReelsUsersController, ReelsRedirectController],
  providers: [
    ReelsService,
    ReelsMockStore,
    { provide: REELS_REPOSITORY, useExisting: ReelsMockStore },
  ],
})
export class ReelsModule {}
