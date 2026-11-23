import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UsersModule } from '../users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FamilyCoreModule } from '../family-core/family-core.module';
import { ISSUER_PROVIDER } from './issuer/issuer-provider';
import { StubIssuerProvider } from './issuer/stub-issuer.provider';
import { CARD_SYNC_QUEUE, CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { CardSyncProcessor } from './card-sync.processor';
import { CardAuthorizationService } from './card-authorization.service';
import { CardEventsService } from './card-events.service';

/** 026 (research R6): card issuing and card events, behind `IssuerProvider`. */
@Module({
  imports: [
    ConfigModule,
    FamilyCoreModule,
    UsersModule,
    BullModule.registerQueue({ name: CARD_SYNC_QUEUE }),
  ],
  controllers: [CardsController],
  providers: [
    CardSyncProcessor,
    CardsService,
    CardAuthorizationService,
    CardEventsService,
    StubIssuerProvider,
    {
      provide: ISSUER_PROVIDER,
      inject: [ConfigService, StubIssuerProvider],
      // 'stub' is the only value Joi accepts until the NymCard adapter lands.
      useFactory: (_config: ConfigService, stub: StubIssuerProvider) => stub,
    },
  ],
  exports: [
    ISSUER_PROVIDER,
    CardsService,
    CardAuthorizationService,
    CardEventsService,
  ],
})
export class CardsModule {}
