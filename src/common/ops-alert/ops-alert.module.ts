import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpsAlertService } from './ops-alert.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [OpsAlertService],
  exports: [OpsAlertService],
})
export class OpsAlertModule {}
