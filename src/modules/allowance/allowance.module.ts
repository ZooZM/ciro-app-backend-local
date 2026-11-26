import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UsersModule } from '../users/users.module';
import { FamilyCoreModule } from '../family-core/family-core.module';
import { WalletModule } from '../wallet/wallet.module';
import { AllowanceController } from './allowance.controller';
import { AllowanceService } from './allowance.service';
import { ActivityFeedService } from './activity-feed.service';
import { PayoutsService } from './payouts.service';
import { AllowanceRequestsModule } from '../allowance-requests/allowance-requests.module';
import {
  ALLOWANCE_SCHEDULER_QUEUE,
  AllowanceSchedulerProcessor,
} from './allowance-scheduler.processor';

/** 026: settings, summary, activity, money controls and payouts. */
@Module({
  imports: [
    FamilyCoreModule,
    WalletModule,
    UsersModule,
    AllowanceRequestsModule,
    BullModule.registerQueue({ name: ALLOWANCE_SCHEDULER_QUEUE }),
  ],
  controllers: [AllowanceController],
  providers: [
    AllowanceService,
    ActivityFeedService,
    PayoutsService,
    AllowanceSchedulerProcessor,
  ],
  exports: [AllowanceService, ActivityFeedService, PayoutsService],
})
export class AllowanceModule {}
