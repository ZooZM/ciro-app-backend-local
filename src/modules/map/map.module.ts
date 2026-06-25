import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MapService } from './map.service';
import { MapController } from './map.controller';
import { MapRepository } from './map.repository';
import { LocationBatchService } from './location-batch.service';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatRoom, ChatRoomSchema } from '../chat/schemas/chat-room.schema';
import { Status, StatusSchema } from '../status/schemas/status.schema';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    UsersModule,
    // `User`/`Status` are re-registered here because importing UsersModule
    // only exposes its exported providers, not its Mongoose feature tokens.
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: ChatRoom.name, schema: ChatRoomSchema },
      { name: Status.name, schema: StatusSchema },
    ]),
    // MapService needs ChatGateway (Ghost Mode emit); ChatGateway needs
    // LocationBatchService (batched fan-out) — see chat.module.ts comment.
    forwardRef(() => ChatModule),
  ],
  providers: [MapService, MapRepository, LocationBatchService],
  controllers: [MapController],
  exports: [MapService, LocationBatchService],
})
export class MapModule {}
