import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Status, StatusSchema } from './schemas/status.schema';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusRepository } from './status.repository';
import { ChatModule } from '../chat/chat.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Status.name, schema: StatusSchema }]),
    forwardRef(() => ChatModule),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [StatusController],
  providers: [StatusService, StatusRepository],
  exports: [StatusService],
})
export class StatusModule {}
