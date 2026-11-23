import { Module } from '@nestjs/common';
import { FamilyCoreModule } from '../family-core/family-core.module';
import { CardsModule } from '../cards/cards.module';
import { WalletModule } from '../wallet/wallet.module';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FamilyController } from './family.controller';
import { FamilyService } from './family.service';
import { LinkCodesService } from './link-codes.service';

/** 026 (FR-001–008): link codes, link/unlink, `GET /family/me`. */
@Module({
  imports: [
    FamilyCoreModule,
    CardsModule,
    WalletModule,
    UsersModule,
    RedisModule,
    AuthModule,
    NotificationsModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService, LinkCodesService],
  exports: [FamilyService, LinkCodesService],
})
export class FamilyModule {}
