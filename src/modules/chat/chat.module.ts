import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { StatusModule } from '../status/status.module';
import { ChatRoom, ChatRoomSchema } from './schemas/chat-room.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { JwtModule } from '@nestjs/jwt';
import { ChatRoomsRepository } from './chat-rooms.repository';
import { MessagesRepository } from './messages.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { MapModule } from '../map/map.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatRoom.name, schema: ChatRoomSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    MulterModule.register({ dest: './uploads' }),
    AuthModule,
    UsersModule,
    JwtModule,
    NotificationsModule,
    RedisModule,
    forwardRef(() => StatusModule),
    // 018-snap-map-realtime: ChatGateway batches `shareLocation` fan-out via
    // LocationBatchService; MapService needs ChatGateway's room channels for
    // the Ghost Mode locationHidden/locationUpdate emit — genuinely mutual,
    // resolved with forwardRef like the existing StatusModule relationship.
    forwardRef(() => MapModule),
  ],
  providers: [
    ChatService,
    ChatGateway,
    ChatRoomsRepository,
    MessagesRepository,
  ],
  exports: [ChatService, ChatGateway, ChatRoomsRepository, MessagesRepository],
  controllers: [ChatController],
})
export class ChatModule {}
