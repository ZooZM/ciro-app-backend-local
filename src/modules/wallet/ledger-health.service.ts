import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';

/**
 * 026 (research R2): money features need multi-document transactions, which
 * need a replica set. On boot this checks `hello.setName`; without it every
 * money route answers `503 LEDGER_UNAVAILABLE`, card authorizations decline
 * with `SERVICE_UNAVAILABLE`, and payout jobs fail so they retry. Chat and
 * the rest of the app keep working.
 */
@Injectable()
export class LedgerHealthService implements OnModuleInit {
  private readonly logger = new Logger(LedgerHealthService.name);
  private available = false;
  private initialCheck?: Promise<boolean>;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly opsAlert: OpsAlertService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ready();
  }

  /** Resolves once the boot check has run (other modules' init hooks may run first). */
  ready(): Promise<boolean> {
    this.initialCheck ??= this.check();
    return this.initialCheck;
  }

  async check(): Promise<boolean> {
    try {
      const db = this.connection.db;
      if (!db) throw new Error('MongoDB connection is not open');
      const hello = await db.admin().command({ hello: 1 });
      this.available =
        typeof hello.setName === 'string' && hello.setName !== '';
    } catch (err) {
      this.logger.warn(`hello failed: ${(err as Error).message}`);
      this.available = false;
    }
    if (!this.available) {
      this.logger.error('[LEDGER DISABLED] MongoDB is not a replica set');
      void this.opsAlert.alert(
        'LEDGER_DISABLED',
        'MongoDB is not a replica set; money features are disabled',
      );
    }
    return this.available;
  }

  get ledgerAvailable(): boolean {
    return this.available;
  }

  /** Test and ops hook. */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  assertAvailable(): void {
    if (!this.available) {
      throw new ServiceUnavailableException({
        message: 'Money features are temporarily unavailable',
        error: 'LEDGER_UNAVAILABLE',
      });
    }
  }
}
