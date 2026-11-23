import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FamilyCoreModule } from '../family-core/family-core.module';
import { WalletModule } from '../wallet/wallet.module';
import { AllowanceRequestsController } from './allowance-requests.controller';
import {
  AllowanceRequestsService,
  REQUEST_SCHEDULER_QUEUE,
} from './allowance-requests.service';

/**
 * 026 (FR-050–057). It only produces jobs on the `allowance-scheduler` queue;
 * the processor that runs them lives in `AllowanceModule`.
 */
@Module({
  imports: [
    FamilyCoreModule,
    WalletModule,
    BullModule.registerQueue({ name: REQUEST_SCHEDULER_QUEUE }),
  ],
  controllers: [AllowanceRequestsController],
  providers: [AllowanceRequestsService],
  exports: [AllowanceRequestsService],
})
export class AllowanceRequestsModule {}
