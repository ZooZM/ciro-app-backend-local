import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LedgerAccount,
  LedgerAccountSchema,
} from './schemas/ledger-account.schema';
import { LedgerEntry, LedgerEntrySchema } from './schemas/ledger-entry.schema';
import {
  ReconciliationReport,
  ReconciliationReportSchema,
} from './schemas/reconciliation-report.schema';
import { LedgerAccountsRepository } from './repositories/ledger-accounts.repository';
import { LedgerEntriesRepository } from './repositories/ledger-entries.repository';
import { LedgerHealthService } from './ledger-health.service';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import {
  LEDGER_MAINTENANCE_QUEUE,
  ReconciliationProcessor,
} from './reconciliation.processor';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';

/** 026 (FR-020–026): the shared Ciro wallet and its append-only ledger. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LedgerAccount.name, schema: LedgerAccountSchema },
      { name: LedgerEntry.name, schema: LedgerEntrySchema },
      { name: ReconciliationReport.name, schema: ReconciliationReportSchema },
    ]),
    BullModule.registerQueue({ name: LEDGER_MAINTENANCE_QUEUE }),
  ],
  controllers: [WalletController, ReconciliationController],
  providers: [
    LedgerHealthService,
    LedgerAccountsRepository,
    LedgerEntriesRepository,
    LedgerService,
    WalletService,
    ReconciliationService,
    ReconciliationProcessor,
    AdminKeyGuard,
  ],
  exports: [
    LedgerHealthService,
    LedgerService,
    WalletService,
    LedgerEntriesRepository,
    ReconciliationService,
  ],
})
export class WalletModule {}
