import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletModule } from '../wallet/wallet.module';
import { ReconciliationService } from '../wallet/reconciliation.service';
import { riyadhDate } from '../../common/utils/riyadh-time.util';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { FamilyLink, FamilyLinkSchema } from './schemas/family-link.schema';
import {
  AllowanceSettings,
  AllowanceSettingsSchema,
} from './schemas/allowance-settings.schema';
import { Card, CardSchema } from './schemas/card.schema';
import {
  CardTransaction,
  CardTransactionSchema,
} from './schemas/card-transaction.schema';
import {
  AllowancePayout,
  AllowancePayoutSchema,
} from './schemas/allowance-payout.schema';
import {
  AllowanceRequest,
  AllowanceRequestSchema,
} from './schemas/allowance-request.schema';
import {
  DailyLimitBoost,
  DailyLimitBoostSchema,
} from './schemas/daily-limit-boost.schema';
import { FamilyLinksRepository } from './repositories/family-links.repository';
import { AllowanceSettingsRepository } from './repositories/allowance-settings.repository';
import { CardsRepository } from './repositories/cards.repository';
import { CardTransactionsRepository } from './repositories/card-transactions.repository';
import { AllowancePayoutsRepository } from './repositories/allowance-payouts.repository';
import { AllowanceRequestsRepository } from './repositories/allowance-requests.repository';
import { DailyLimitBoostsRepository } from './repositories/daily-limit-boosts.repository';
import { FamilyAccessService } from './family-access.service';
import { SpendCounterService } from './spend-counter.service';
import { ChildSummaryService } from './child-summary.service';
import { AllowanceEventsService } from './allowance-events.service';

const REPOSITORIES = [
  FamilyLinksRepository,
  AllowanceSettingsRepository,
  CardsRepository,
  CardTransactionsRepository,
  AllowancePayoutsRepository,
  AllowanceRequestsRepository,
  DailyLimitBoostsRepository,
];

const SERVICES = [
  FamilyAccessService,
  SpendCounterService,
  ChildSummaryService,
  AllowanceEventsService,
];

/**
 * 026 (plan Complexity Tracking #6): internal module with no controllers.
 * Holds what `family`, `allowance`, `allowance-requests` and `cards` all
 * need, so those modules never import each other in a cycle.
 */
@Module({
  imports: [
    WalletModule,
    ChatModule,
    NotificationsModule,
    RedisModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: FamilyLink.name, schema: FamilyLinkSchema },
      { name: AllowanceSettings.name, schema: AllowanceSettingsSchema },
      { name: Card.name, schema: CardSchema },
      { name: CardTransaction.name, schema: CardTransactionSchema },
      { name: AllowancePayout.name, schema: AllowancePayoutSchema },
      { name: AllowanceRequest.name, schema: AllowanceRequestSchema },
      { name: DailyLimitBoost.name, schema: DailyLimitBoostSchema },
    ]),
  ],
  providers: [...REPOSITORIES, ...SERVICES],
  exports: [...REPOSITORIES, ...SERVICES, WalletModule],
})
export class FamilyCoreModule implements OnModuleInit {
  constructor(
    private readonly reconciliation: ReconciliationService,
    private readonly spendCounter: SpendCounterService,
  ) {}

  /** The nightly check also rewrites today's spend counters that drifted from the records (R15). */
  onModuleInit(): void {
    this.reconciliation.registerCheck('spend-counters', async () => {
      const counterRewrites = await this.spendCounter.reconcileDay(
        riyadhDate(new Date()),
      );
      return {
        ok: true,
        details: { rewritten: counterRewrites.length },
        counterRewrites,
      };
    });
  }
}
