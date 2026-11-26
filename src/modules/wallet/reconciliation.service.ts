import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import { LedgerAccountsRepository } from './repositories/ledger-accounts.repository';
import { LedgerEntriesRepository } from './repositories/ledger-entries.repository';
import {
  AccountMismatch,
  CounterRewrite,
  ExtraCheckResult,
  ReconciliationReport,
  ReconciliationReportDocument,
} from './schemas/reconciliation-report.schema';

/** A check another module registers; its result goes into the same report. */
export type ReconciliationCheck = () => Promise<{
  ok: boolean;
  details?: Record<string, unknown>;
  counterRewrites?: CounterRewrite[];
}>;

/** How long to wait before re-checking a suspected mismatch (an in-flight transfer settles by then). */
const RECHECK_DELAY_MS = 750;

/**
 * 026 (FR-022, SC-005, research R15): proves every cached balance equals
 * Σcredits − Σdebits. Run nightly and on demand. Every confirmed difference
 * raises the ops alert `LEDGER_MISMATCH`; a clean run raises none.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly checks = new Map<string, ReconciliationCheck>();

  /** Overridable in tests. */
  recheckDelayMs = RECHECK_DELAY_MS;

  constructor(
    private readonly accounts: LedgerAccountsRepository,
    private readonly entries: LedgerEntriesRepository,
    private readonly opsAlert: OpsAlertService,
    @InjectModel(ReconciliationReport.name)
    private readonly reports: Model<ReconciliationReportDocument>,
  ) {}

  registerCheck(name: string, check: ReconciliationCheck): void {
    this.checks.set(name, check);
  }

  async run(): Promise<ReconciliationReportDocument> {
    const runAt = new Date();
    const { mismatches, accountsChecked } = await this.checkBalances();

    const checks: ExtraCheckResult[] = [];
    const counterRewrites: CounterRewrite[] = [];
    for (const [name, check] of this.checks) {
      try {
        const result = await check();
        checks.push({ name, ok: result.ok, details: result.details });
        counterRewrites.push(...(result.counterRewrites ?? []));
      } catch (err) {
        checks.push({
          name,
          ok: false,
          details: { error: (err as Error).message },
        });
      }
    }
    if (counterRewrites.length > 0) {
      this.logger.warn(
        `Rewrote ${counterRewrites.length} drifted spend counter(s)`,
      );
    }

    const status =
      mismatches.length > 0 || checks.some((c) => !c.ok) ? 'mismatch' : 'ok';
    const report = await this.reports.create({
      runAt,
      accountsChecked,
      mismatches,
      counterRewrites,
      checks,
      status,
    });

    if (status === 'mismatch') {
      await this.opsAlert.alert(
        'LEDGER_MISMATCH',
        'Ledger reconciliation found differences',
        {
          reportId: report._id.toString(),
          mismatches: mismatches.length,
          failedChecks: checks.filter((c) => !c.ok).map((c) => c.name),
        },
      );
    }
    return report;
  }

  async latest(limit = 10): Promise<ReconciliationReportDocument[]> {
    const n = Math.min(Math.max(Math.floor(limit) || 10, 1), 100);
    return this.reports.find({}).sort({ runAt: -1 }).limit(n).exec();
  }

  /** Two passes: a difference only counts if it is still there after a short wait. */
  private async checkBalances(): Promise<{
    mismatches: AccountMismatch[];
    accountsChecked: number;
  }> {
    const first = await this.compare();
    if (first.mismatches.length === 0)
      return { mismatches: [], accountsChecked: first.accountsChecked };
    await new Promise((resolve) => setTimeout(resolve, this.recheckDelayMs));
    const ids = first.mismatches.map((m) => m.accountId);
    const second = await this.compare(ids);
    return {
      mismatches: second.mismatches,
      accountsChecked: first.accountsChecked,
    };
  }

  private async compare(
    only?: Types.ObjectId[],
  ): Promise<{ mismatches: AccountMismatch[]; accountsChecked: number }> {
    const derived = await this.entries.derivedBalances(only);
    const mismatches: AccountMismatch[] = [];
    let checked = 0;
    const cursor = only
      ? (await this.accounts.findByIds(only))
          .map((a) => a.toObject())
          [Symbol.iterator]()
      : null;
    const each = (acc: { _id: Types.ObjectId; balanceHalalas: number }) => {
      checked++;
      const expected = derived.get(acc._id.toString()) ?? 0;
      if (acc.balanceHalalas !== expected) {
        mismatches.push({
          accountId: acc._id,
          cachedHalalas: acc.balanceHalalas,
          derivedHalalas: expected,
        });
      }
    };
    if (cursor) {
      for (const acc of cursor as Iterable<{
        _id: Types.ObjectId;
        balanceHalalas: number;
      }>)
        each(acc);
    } else {
      for await (const acc of this.accounts.allCursor())
        each(acc as { _id: Types.ObjectId; balanceHalalas: number });
    }
    return { mismatches, accountsChecked: checked };
  }
}
