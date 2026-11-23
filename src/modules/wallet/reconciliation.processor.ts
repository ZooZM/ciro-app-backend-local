import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { ReconciliationService } from './reconciliation.service';

export const LEDGER_MAINTENANCE_QUEUE = 'ledger-maintenance';

/**
 * 026 (research R15): the nightly check runs on the wallet module's OWN queue
 * so the shared wallet's reconciliation never depends on the allowance module.
 */
@Injectable()
@Processor(LEDGER_MAINTENANCE_QUEUE)
export class ReconciliationProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(ReconciliationProcessor.name);

  constructor(
    @InjectQueue(LEDGER_MAINTENANCE_QUEUE) private readonly queue: Queue,
    private readonly reconciliation: ReconciliationService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        'ledger-reconciliation',
        { pattern: '0 3 * * *', tz: 'Asia/Riyadh' },
        { name: 'ledger-reconciliation', data: {} },
      );
    } catch (err) {
      this.logger.error(
        `Could not register the reconciliation scheduler: ${(err as Error).message}`,
      );
    }
  }

  async process(
    job: Job,
  ): Promise<{ reportId: string; status: string } | undefined> {
    if (job.name !== 'ledger-reconciliation') return undefined;
    const report = await this.reconciliation.run();
    return { reportId: report._id.toString(), status: report.status };
  }
}
