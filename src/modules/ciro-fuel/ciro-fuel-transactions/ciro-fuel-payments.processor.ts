import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { CiroFuelPaymentsService } from './ciro-fuel-payments.service';
import {
  CIRO_FUEL_PAYMENT_JOB,
  CIRO_FUEL_PAYMENT_PROCESSING_LEASE_MS,
  CIRO_FUEL_PAYMENT_QUEUE,
  CIRO_FUEL_PAYMENT_SWEEP_INTERVAL_MS,
  paymentJobOptions,
} from './ciro-fuel-payment.constants';

@Injectable()
@Processor(CIRO_FUEL_PAYMENT_QUEUE)
export class CiroFuelPaymentsProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CiroFuelPaymentsProcessor.name);
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly paymentsService: CiroFuelPaymentsService,
    private readonly ciroFuelTransactionsRepository: CiroFuelTransactionsRepository,
    @InjectQueue(CIRO_FUEL_PAYMENT_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  /** Starts recovery sweeps for pending work and claims abandoned by a worker. */
  onModuleInit(): void {
    void this.sweep();
    this.sweepTimer = setInterval(
      () => void this.sweep(),
      CIRO_FUEL_PAYMENT_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /** BullMQ entry point; payment rules and state changes live in the service. */
  async process(job: Job<{ transactionId: string }>): Promise<void> {
    await this.paymentsService.processPendingTransaction(
      job.data.transactionId,
    );
  }

  /**
   * Re-enqueues pending or stale processing transactions in case their jobs
   * were lost or their worker stopped; the repository claim prevents overlap.
   */
  private async sweep(): Promise<void> {
    try {
      const staleBefore = new Date(
        Date.now() - CIRO_FUEL_PAYMENT_PROCESSING_LEASE_MS,
      );
      const transactionIds =
        await this.ciroFuelTransactionsRepository.findIdsNeedingPaymentProcessing(
          staleBefore,
        );
      for (const transactionId of transactionIds) {
        await this.queue.add(
          CIRO_FUEL_PAYMENT_JOB,
          { transactionId },
          paymentJobOptions(transactionId),
        );
      }
      if (transactionIds.length > 0) {
        this.logger.log(
          `Payment sweep enqueued ${transactionIds.length} Ciro Fuel transaction(s)`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown queue sweep error';
      this.logger.warn(`Payment sweep failed: ${message}`);
    }
  }
}
