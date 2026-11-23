import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceToken, DeviceTokenSchema } from './device-token.schema';
import { DeviceTokensRepository } from './device-tokens.repository';
import { PushService } from './push.service';
import { ApnsWatchClient } from './apns-watch.client';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),
  ],
  providers: [DeviceTokensRepository, PushService, ApnsWatchClient],
  exports: [PushService, DeviceTokensRepository, ApnsWatchClient],
})
export class NotificationsModule {}
