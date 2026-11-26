import { Module } from '@nestjs/common';
import { FamilyCoreModule } from '../../family-core/family-core.module';
import { AllowanceModule } from '../allowance.module';
import { AllowanceRequestsModule } from '../../allowance-requests/allowance-requests.module';
import {
  AllowanceDevController,
  AllowanceDevJobs,
} from './allowance-dev.controller';

/** [DEV] Registered only when NODE_ENV !== 'production' (app.module.ts). */
@Module({
  imports: [AllowanceModule, AllowanceRequestsModule, FamilyCoreModule],
  controllers: [AllowanceDevController],
  providers: [AllowanceDevJobs],
})
export class AllowanceDevModule {}
