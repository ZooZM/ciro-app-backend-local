import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { PayoutsService } from './payouts.service';
import { AllowanceRequestsService } from '../allowance-requests/allowance-requests.service';

export const ALLOWANCE_SCHEDULER_QUEUE = 'allowance-scheduler';
const TZ = 'Asia/Riyadh';
export const PAYOUT_ATTEMPTS = 6;

interface AllowanceJobData {
  childId?: string;
  month?: string;
  requestId?: string;
}

/**
 * 026 (research R14): BullMQ job schedulers in Asia/Riyadh plus the per-item
 * jobs. Handlers are thin wrappers over services so they can be tested
 * without a live queue.
 */
@Injectable()
@Processor(ALLOWANCE_SCHEDULER_QUEUE)
export class AllowanceSchedulerProcessor
  extends WorkerHost
  implements OnModuleInit
{
  private readonly logger = new Logger(AllowanceSchedulerProcessor.name);

  constructor(
    @InjectQueue(ALLOWANCE_SCHEDULER_QUEUE) private readonly queue: Queue,
    private readonly payouts: PayoutsService,
    private readonly requests: AllowanceRequestsService,
    private readonly opsAlert: OpsAlertService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        'allowance-payout-daily',
        { pattern: '0 6 * * *', tz: TZ },
        { name: 'payout-fanout', data: {} },
      );
      await this.queue.upsertJobScheduler(
        'allowance-payout-reminder',
        { pattern: '0 18 * * *', tz: TZ },
        { name: 'payout-reminders', data: {} },
      );
      // Backs up the per-request delayed `request-expire` job (FR-052).
      await this.queue.upsertJobScheduler(
        'allowance-request-expiry-sweep',
        { pattern: '*/10 * * * *', tz: TZ },
        { name: 'request-expiry-sweep', data: {} },
      );
    } catch (err) {
      this.logger.error(
        `Could not register allowance schedulers: ${(err as Error).message}`,
      );
    }
  }

  async process(job: Job<AllowanceJobData>): Promise<unknown> {
    switch (job.name) {
      case 'payout-fanout':
        return this.fanOutPayouts();
      case 'payout':
        return this.payouts.payOne(
          job.data.childId as string,
          job.data.month as string,
        );
      case 'payout-reminders':
        return this.payouts.runReminders(new Date());
      case 'request-expire':
        return this.requests.expire(job.data.requestId!);
      case 'request-expiry-sweep':
        return this.requests.expireOverdue(new Date());
      default:
        return this.processExtra(job);
    }
  }

  /** Extension point for the request-expiry jobs (US5). */
  protected processExtra(job: Job<AllowanceJobData>): Promise<unknown> {
    this.logger.warn(`Unknown allowance job ${job.name}`);
    return Promise.resolve(undefined);
  }

  /** The daily 06:00 job: one `payout` job per due child, deduplicated by job id. */
  async fanOutPayouts(): Promise<number> {
    const due = await this.payouts.findDue(new Date());
    for (const { childId, month } of due) {
      await this.queue.add(
        'payout',
        { childId, month },
        {
          jobId: `payout-${childId}-${month}`,
          attempts: PAYOUT_ATTEMPTS,
          backoff: { type: 'exponential', delay: 2 * 60 * 1000 },
          removeOnComplete: { age: 7 * 24 * 3600 },
        },
      );
    }
    return due.length;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, err: Error): Promise<void> {
    if (!job) return;
    await this.handleFailure(job, err);
  }

  /**
   * When the last attempt of a `payout` job fails the payout becomes a
   * `failed` / `SERVICE_UNAVAILABLE` row (so the parent gets Pay now) and an
   * ops alert goes out. If writing the row fails too, the alert still goes out.
   */
  async handleFailure(
    job: Pick<Job, 'name' | 'data' | 'attemptsMade' | 'opts'>,
    err: Error,
  ): Promise<void> {
    if (job.name !== 'payout') return;
    if (job.attemptsMade < (job.opts?.attempts ?? 1)) return;
    const { childId, month } = job.data as { childId: string; month: string };
    try {
      await this.payouts.markSystemFailed(childId, month);
    } catch (markErr) {
      this.logger.error(
        `markSystemFailed(${childId}, ${month}) failed: ${(markErr as Error).message}`,
      );
    }
    await this.opsAlert.alert(
      'PAYOUT_SYSTEM_FAILURE',
      `Allowance payout for ${childId} ${month} failed after all retries`,
      {
        childUserId: childId,
        month,
        error: err.message,
      },
    );
  }
}
