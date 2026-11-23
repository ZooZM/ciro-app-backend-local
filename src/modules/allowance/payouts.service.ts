import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Types } from 'mongoose';
import {
  addDays,
  addMonths,
  effectivePayoutDate,
  riyadhDate,
  riyadhDayStartUtc,
  riyadhMonth,
} from '../../common/utils/riyadh-time.util';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import {
  InsufficientBalanceError,
  isDuplicateKeyError,
} from '../wallet/ledger.errors';
import { FamilyAccessService } from '../family-core/family-access.service';
import { FamilyLinksRepository } from '../family-core/repositories/family-links.repository';
import { AllowanceSettingsRepository } from '../family-core/repositories/allowance-settings.repository';
import { AllowancePayoutsRepository } from '../family-core/repositories/allowance-payouts.repository';
import { ChildSummaryService } from '../family-core/child-summary.service';
import { AllowanceEventsService } from '../family-core/allowance-events.service';
import {
  AllowancePayoutDocument,
  PayoutFailureReason,
} from '../family-core/schemas/allowance-payout.schema';
import { FamilyLinkDocument } from '../family-core/schemas/family-link.schema';
import {
  fromFailedPayout,
  fromLedgerEntry,
} from '../family-core/activity-mapper';
import { TWO_DAYS_SECONDS } from '../family-core/family-core.constants';
import {
  insufficientFunds,
  payoutNotPayable,
} from '../family-core/allowance-errors';

export interface DuePayout {
  childId: string;
  month: string;
}

export type PayOneResult =
  | { status: 'paid' | 'failed'; payoutId: string }
  | { status: 'skipped' };

/**
 * 026 (FR-030–036, research R14): the monthly allowance. The unique
 * `(childUserId, month)` index and the ledger key `payout:{childId}:{YYYY-MM}`
 * make a payout happen at most once per calendar month, however many times
 * the scheduler, a retry or "Pay now" runs.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly access: FamilyAccessService,
    private readonly links: FamilyLinksRepository,
    private readonly settings: AllowanceSettingsRepository,
    private readonly payouts: AllowancePayoutsRepository,
    private readonly wallet: WalletService,
    private readonly summaries: ChildSummaryService,
    private readonly events: AllowanceEventsService,
    private readonly users: UsersService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  static key(childId: string, month: string): string {
    return `payout:${childId}:${month}`;
  }

  /**
   * Children owed a payout as of `asOf`: allowance above 0, this month ≥
   * `payoutsActiveFromMonth`, today ≥ the effective payout date (days 29–31
   * clamp), and no payout row yet for the month. A payout day moved earlier
   * is caught up by the next run; one moved later after the month was paid
   * does nothing, so no month is skipped or paid twice.
   */
  async findDue(
    asOf: Date,
    scope: { childIds?: Types.ObjectId[] } = {},
  ): Promise<DuePayout[]> {
    const month = riyadhMonth(asOf);
    const today = riyadhDate(asOf);
    const links = await this.links.findAllActive({ childIds: scope.childIds });
    if (links.length === 0) return [];
    const settings = await this.settings.findByLinkIds(links.map((l) => l._id));
    const bySettings = new Map(settings.map((s) => [s.linkId.toString(), s]));
    const existing = await this.payouts.findMonthsForChildren(
      links.map((l) => l.childUserId),
      month,
    );
    const done = new Set(existing.map((p) => p.childUserId.toString()));

    const due: DuePayout[] = [];
    for (const link of links) {
      const s = bySettings.get(link._id.toString());
      if (!s || s.monthlyAmountHalalas <= 0) continue;
      if (!s.payoutsActiveFromMonth || month < s.payoutsActiveFromMonth)
        continue;
      if (today < effectivePayoutDate(month, s.payoutDay)) continue;
      if (done.has(link.childUserId.toString())) continue;
      due.push({ childId: link.childUserId.toString(), month });
    }
    return due;
  }

  /**
   * Pays one child's month. `INSUFFICIENT_FUNDS` is a business outcome: it
   * writes a `failed` row and nothing is retried automatically (FR-032). Any
   * other error is rethrown so the job is retried.
   */
  async payOne(
    childId: string,
    month: string,
    asOf = new Date(),
  ): Promise<PayOneResult> {
    const childOid = new Types.ObjectId(childId);
    if (await this.payouts.findByChildAndMonth(childOid, month))
      return { status: 'skipped' };
    const link = await this.links.findActiveByChild(childId);
    const settings = link ? await this.settings.findByLinkId(link._id) : null;
    if (!link || !settings || settings.monthlyAmountHalalas <= 0)
      return { status: 'skipped' };

    const amountHalalas = settings.monthlyAmountHalalas;
    const scheduledFor = effectivePayoutDate(month, settings.payoutDay);
    const base = {
      childUserId: link.childUserId,
      parentUserId: link.parentUserId,
      linkId: link._id,
      month,
      scheduledFor,
      amountHalalas,
    };

    let payout: AllowancePayoutDocument;
    let entryItem;
    try {
      ({ payout, entryItem } = await this.wallet.runInTransaction(
        async (session) => {
          const parentWallet = await this.wallet.getOrCreateUserWallet(
            link.parentUserId,
            session,
          );
          const { entry } = await this.wallet.transfer(
            {
              type: EntryType.ALLOWANCE_PAYOUT,
              fromAccountId: parentWallet._id,
              toAccountId: link.childAccountId,
              amountHalalas,
              idempotencyKey: PayoutsService.key(childId, month),
              initiator: { kind: 'system' },
              refs: { linkId: link._id },
              riyadhDate: riyadhDate(asOf),
            },
            session,
          );
          const row = await this.payouts.insert(
            {
              ...base,
              status: 'paid',
              ledgerEntryId: entry._id,
              paidAt: new Date(),
            },
            session,
          );
          await this.links.bumpRev(link._id, session);
          return { payout: row, entryItem: fromLedgerEntry(entry) };
        },
      ));
    } catch (err) {
      if (isDuplicateKeyError(err)) return { status: 'skipped' };
      if (!(err instanceof InsufficientBalanceError)) throw err;
      return this.recordFailure(link, base, 'INSUFFICIENT_FUNDS');
    }

    await this.afterPaid(link, payout, entryItem ?? undefined, 'payout');
    return { status: 'paid', payoutId: payout._id.toString() };
  }

  /**
   * Final fallback after the last same-morning retry (SC-006): writes a
   * `failed` row with `SERVICE_UNAVAILABLE` and no ledger entry, and tells
   * the parent (never mentioning funds). Pay now works on it like any
   * failed payout. Uses plain writes because the ledger may be what is down.
   */
  async markSystemFailed(
    childId: string,
    month: string,
  ): Promise<PayOneResult> {
    const childOid = new Types.ObjectId(childId);
    if (await this.payouts.findByChildAndMonth(childOid, month))
      return { status: 'skipped' };
    const link = await this.links.findActiveByChild(childId);
    const settings = link ? await this.settings.findByLinkId(link._id) : null;
    if (!link || !settings) return { status: 'skipped' };
    return this.recordFailure(
      link,
      {
        childUserId: link.childUserId,
        parentUserId: link.parentUserId,
        linkId: link._id,
        month,
        scheduledFor: effectivePayoutDate(month, settings.payoutDay),
        amountHalalas: settings.monthlyAmountHalalas,
      },
      'SERVICE_UNAVAILABLE',
    );
  }

  private async recordFailure(
    link: FamilyLinkDocument,
    base: Partial<AllowancePayoutDocument>,
    reason: PayoutFailureReason,
  ): Promise<PayOneResult> {
    let row: AllowancePayoutDocument;
    try {
      row = await this.payouts.insert({
        ...base,
        status: 'failed',
        failureReason: reason,
        failedAt: new Date(),
      });
      await this.links.bumpRev(link._id);
    } catch (err) {
      if (isDuplicateKeyError(err)) return { status: 'skipped' };
      throw err;
    }
    const childId = link.childUserId.toString();
    await this.events.summaryChanged(
      childId,
      'payout_failed',
      fromFailedPayout(row),
      link,
    );
    const child = await this.users.findById(childId);
    await this.events.notify(
      link.parentUserId.toString(),
      'allowance.payoutFailed',
      {
        childName: child?.name ?? '',
        amountHalalas: row.amountHalalas,
        reason,
        childId,
      },
      { childId, data: { payoutId: row._id.toString(), reason } },
    );
    return { status: 'failed', payoutId: row._id.toString() };
  }

  /** FR-032 "Pay now": a failed payout can be paid until the next payout date. */
  async payNow(
    actorId: string,
    childId: string,
    payoutId: string,
    asOf = new Date(),
  ) {
    const link = await this.access.assertParentOf(actorId, childId);
    const payout = Types.ObjectId.isValid(payoutId)
      ? await this.payouts.findById(payoutId)
      : null;
    if (
      !payout ||
      !payout.linkId.equals(link._id) ||
      payout.status !== 'failed'
    ) {
      throw payoutNotPayable();
    }
    const settings = await this.settings.findByLinkId(link._id);
    const payableUntil = riyadhDayStartUtc(
      effectivePayoutDate(addMonths(payout.month, 1), settings?.payoutDay ?? 1),
    );
    if (asOf >= payableUntil) throw payoutNotPayable();

    let paid: {
      row: AllowancePayoutDocument;
      entryItem: ReturnType<typeof fromLedgerEntry>;
    };
    try {
      paid = await this.wallet.runInTransaction(async (session) => {
        const parentWallet = await this.wallet.getOrCreateUserWallet(
          link.parentUserId,
          session,
        );
        const { entry } = await this.wallet.transfer(
          {
            type: EntryType.ALLOWANCE_PAYOUT,
            fromAccountId: parentWallet._id,
            toAccountId: link.childAccountId,
            amountHalalas: payout.amountHalalas,
            // Same key as the scheduler's, so a race with it cannot pay twice.
            idempotencyKey: PayoutsService.key(childId, payout.month),
            initiator: { kind: 'parent', userId: new Types.ObjectId(actorId) },
            refs: { linkId: link._id, payoutId: payout._id },
            riyadhDate: riyadhDate(asOf),
          },
          session,
        );
        const row = await this.payouts.markPaidLate(
          payout._id,
          entry._id,
          session,
        );
        if (!row) throw payoutNotPayable();
        await this.links.bumpRev(link._id, session);
        return { row, entryItem: fromLedgerEntry(entry) };
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) throw insufficientFunds();
      throw err;
    }

    await this.afterPaid(link, paid.row, paid.entryItem ?? undefined, 'payout');
    return {
      payout: {
        id: paid.row._id.toString(),
        month: paid.row.month,
        status: 'paid_late' as const,
        amountHalalas: paid.row.amountHalalas,
      },
      summary: await this.summaries.getSummaryForLink(link),
    };
  }

  private async afterPaid(
    link: FamilyLinkDocument,
    payout: AllowancePayoutDocument,
    item: ReturnType<typeof fromLedgerEntry> | undefined,
    reason: 'payout',
  ): Promise<void> {
    const childId = link.childUserId.toString();
    const child = await this.users.findById(childId);
    const vars = {
      childName: child?.name ?? '',
      amountHalalas: payout.amountHalalas,
      childId,
    };
    await this.events.summaryChanged(childId, reason, item ?? undefined, link);
    await Promise.all([
      this.events.notify(
        childId,
        'allowance.payoutPaid',
        { ...vars, audience: 'child' },
        { childId, data: { payoutId: payout._id.toString() } },
      ),
      this.events.notify(
        link.parentUserId.toString(),
        'allowance.payoutPaid',
        { ...vars, audience: 'parent' },
        { childId, data: { payoutId: payout._id.toString() } },
      ),
    ]);
  }

  /**
   * FR-033: the day before payouts, parents whose wallet is below the total
   * due tomorrow get one reminder per day (`SET NX`). Returns how many were sent.
   */
  async runReminders(
    asOf: Date,
    scope: { parentIds?: Types.ObjectId[] } = {},
  ): Promise<number> {
    const today = riyadhDate(asOf);
    const tomorrow = addDays(today, 1);
    const month = tomorrow.slice(0, 7);
    const links = await this.links.findAllActive({
      parentIds: scope.parentIds,
    });
    if (links.length === 0) return 0;
    const settings = await this.settings.findByLinkIds(links.map((l) => l._id));
    const bySettings = new Map(settings.map((s) => [s.linkId.toString(), s]));
    const paid = new Set(
      (
        await this.payouts.findMonthsForChildren(
          links.map((l) => l.childUserId),
          month,
        )
      ).map((p) => p.childUserId.toString()),
    );

    const dueByParent = new Map<string, { total: number; childId: string }>();
    for (const link of links) {
      const s = bySettings.get(link._id.toString());
      if (!s || s.monthlyAmountHalalas <= 0 || !s.payoutsActiveFromMonth)
        continue;
      if (month < s.payoutsActiveFromMonth) continue;
      if (effectivePayoutDate(month, s.payoutDay) !== tomorrow) continue;
      if (paid.has(link.childUserId.toString())) continue;
      const parent = link.parentUserId.toString();
      const entry = dueByParent.get(parent) ?? {
        total: 0,
        childId: link.childUserId.toString(),
      };
      entry.total += s.monthlyAmountHalalas;
      dueByParent.set(parent, entry);
    }

    let sent = 0;
    for (const [parentId, { total, childId }] of dueByParent) {
      const account = await this.wallet.findUserWallet(parentId);
      const balance = account?.balanceHalalas ?? 0;
      if (balance >= total) continue;
      const first = await this.redis.set(
        `allowance:reminder:${parentId}:${today}`,
        1,
        'EX',
        TWO_DAYS_SECONDS,
        'NX',
      );
      if (first !== 'OK') continue;
      await this.events.notify(
        parentId,
        'allowance.payoutReminder',
        { neededHalalas: total, balanceHalalas: balance, childId },
        { childId },
      );
      sent++;
    }
    return sent;
  }
}
