import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  addMonths,
  effectivePayoutDate,
  riyadhDate,
  riyadhHour,
  riyadhMonth,
} from '../../common/utils/riyadh-time.util';
import { WalletService } from '../wallet/wallet.service';
import { FamilyAccessService } from '../family-core/family-access.service';
import { FamilyLinksRepository } from '../family-core/repositories/family-links.repository';
import { AllowanceSettingsRepository } from '../family-core/repositories/allowance-settings.repository';
import { ChildSummaryService } from '../family-core/child-summary.service';
import { AllowanceEventsService } from '../family-core/allowance-events.service';
import { AllowanceSettingsDocument } from '../family-core/schemas/allowance-settings.schema';
import {
  ALWAYS_BLOCKED_CATEGORIES,
  BlockableCategory,
} from '../family-core/family-core.constants';
import {
  perPurchaseAboveDailyLimit,
  childNotFound,
} from '../family-core/allowance-errors';
import { UpdateAllowanceSettingsDto } from './dto/update-allowance-settings.dto';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import { InsufficientBalanceError } from '../wallet/ledger.errors';
import { fromLedgerEntry } from '../family-core/activity-mapper';
import {
  amountExceedsChildBalance,
  insufficientFunds,
} from '../family-core/allowance-errors';
import type { ChildSummaryDto } from '../family-core/child-summary.service';

/** First hour (Riyadh) at which the daily payout job has run, research R14. */
const PAYOUT_JOB_HOUR = 6;

export interface AllowanceSettingsDto {
  childId: string;
  monthlyAmountHalalas: number;
  payoutDay: number;
  dailyLimitHalalas: number;
  perPurchaseMaxHalalas: number;
  blockedCategories: BlockableCategory[];
  alwaysBlockedCategories: readonly string[];
  purchaseNotifications: boolean;
  nextPayoutDate: string | null;
  currency: 'SAR';
  updatedAt: string;
}

/**
 * Research R14: the first month a payout may happen. It is this month when
 * the payout date has not been reached yet (or it is the payout date but the
 * 06:00 job has not run), otherwise next month. No proration.
 */
export function firstPayoutMonth(payoutDay: number, now: Date): string {
  const month = riyadhMonth(now);
  const payoutDate = effectivePayoutDate(month, payoutDay);
  const today = riyadhDate(now);
  if (today < payoutDate) return month;
  if (today === payoutDate && riyadhHour(now) < PAYOUT_JOB_HOUR) return month;
  return addMonths(month, 1);
}

/** The date shown as "next payout", or null when there is no allowance. */
export function nextPayoutDate(
  monthlyAmountHalalas: number,
  payoutDay: number,
  now: Date,
): string | null {
  if (monthlyAmountHalalas <= 0) return null;
  const month = riyadhMonth(now);
  const thisMonth = effectivePayoutDate(month, payoutDay);
  return riyadhDate(now) <= thisMonth
    ? thisMonth
    : effectivePayoutDate(addMonths(month, 1), payoutDay);
}

/** 026: settings and summary reads/writes. Parent routes re-check ownership on every call. */
@Injectable()
export class AllowanceService {
  constructor(
    private readonly access: FamilyAccessService,
    private readonly links: FamilyLinksRepository,
    private readonly settingsRepo: AllowanceSettingsRepository,
    private readonly summaries: ChildSummaryService,
    private readonly events: AllowanceEventsService,
    private readonly wallet: WalletService,
  ) {}

  async getSettings(
    actorId: string,
    childId: string,
  ): Promise<AllowanceSettingsDto> {
    const link = await this.access.assertParentOf(actorId, childId);
    return this.settingsFor(link._id);
  }

  async getMySettings(actorId: string): Promise<AllowanceSettingsDto> {
    const link = await this.access.assertLinkedChild(actorId);
    return this.settingsFor(link._id);
  }

  async updateSettings(
    actorId: string,
    childId: string,
    dto: UpdateAllowanceSettingsDto,
    now = new Date(),
  ): Promise<AllowanceSettingsDto> {
    const link = await this.access.assertParentOf(actorId, childId);
    if (dto.perPurchaseMaxHalalas > dto.dailyLimitHalalas) {
      throw perPurchaseAboveDailyLimit();
    }
    if (
      dto.blockedCategories.some((c) =>
        (ALWAYS_BLOCKED_CATEGORIES as readonly string[]).includes(c),
      )
    ) {
      // Defence in depth: the DTO's @IsIn already rejects these with 400.
      throw perPurchaseAboveDailyLimit();
    }

    const updated = await this.wallet.runInTransaction(async (session) => {
      const current = await this.settingsRepo.findByLinkId(link._id, session);
      if (!current) throw childNotFound();
      const turningOn =
        current.monthlyAmountHalalas <= 0 && dto.monthlyAmountHalalas > 0;
      const settings = await this.settingsRepo.update(
        link._id,
        {
          monthlyAmountHalalas: dto.monthlyAmountHalalas,
          payoutDay: dto.payoutDay,
          dailyLimitHalalas: dto.dailyLimitHalalas,
          perPurchaseMaxHalalas: dto.perPurchaseMaxHalalas,
          blockedCategories: dto.blockedCategories,
          purchaseNotifications: dto.purchaseNotifications,
          updatedBy: new Types.ObjectId(actorId),
          ...(turningOn
            ? { payoutsActiveFromMonth: firstPayoutMonth(dto.payoutDay, now) }
            : {}),
        },
        session,
      );
      await this.links.bumpRev(link._id, session);
      return settings;
    });

    await this.events.summaryChanged(childId, 'settings');
    return this.toDto(updated!, now);
  }

  /**
   * US6: parent → child. One transaction (entry + rev bump), idempotent on the
   * `Idempotency-Key` (a replay returns the same entry and bumps nothing).
   * Events and the child's push go out after commit.
   */
  topUp(actorId: string, childId: string, amountHalalas: number, key: string) {
    return this.moveMoney('top_up', actorId, childId, amountHalalas, key);
  }

  /** US6-3: child → parent; refused above the child's balance. */
  pullBack(
    actorId: string,
    childId: string,
    amountHalalas: number,
    key: string,
  ) {
    return this.moveMoney('pull_back', actorId, childId, amountHalalas, key);
  }

  private async moveMoney(
    direction: 'top_up' | 'pull_back',
    actorId: string,
    childId: string,
    amountHalalas: number,
    key: string,
  ): Promise<{
    entryId: string;
    parentBalanceHalalas: number;
    summary: ChildSummaryDto;
  }> {
    const link = await this.access.assertParentOf(actorId, childId);
    let committed;
    try {
      committed = await this.wallet.runInTransaction(async (session) => {
        const parentWallet = await this.wallet.getOrCreateUserWallet(
          actorId,
          session,
        );
        const { entry, replayed } = await this.wallet.transfer(
          {
            type:
              direction === 'top_up' ? EntryType.TOP_UP : EntryType.PULL_BACK,
            fromAccountId:
              direction === 'top_up' ? parentWallet._id : link.childAccountId,
            toAccountId:
              direction === 'top_up' ? link.childAccountId : parentWallet._id,
            amountHalalas,
            idempotencyKey: `${direction === 'top_up' ? 'topup' : 'pullback'}:${key}`,
            initiator: { kind: 'parent', userId: new Types.ObjectId(actorId) },
            refs: { linkId: link._id },
          },
          session,
        );
        if (!replayed) await this.links.bumpRev(link._id, session);
        return {
          entry,
          replayed,
          parentBalanceHalalas: await this.wallet.getBalance(
            parentWallet._id,
            session,
          ),
        };
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        throw direction === 'top_up'
          ? insufficientFunds()
          : amountExceedsChildBalance();
      }
      throw err;
    }

    if (!committed.replayed) {
      const item = fromLedgerEntry(committed.entry);
      await this.events.summaryChanged(
        childId,
        direction,
        item ?? undefined,
        link,
      );
      await this.events.notify(
        childId,
        direction === 'top_up' ? 'allowance.topUp' : 'allowance.pullBack',
        { amountHalalas, childId },
        { childId },
      );
    }
    return {
      entryId: committed.entry._id.toString(),
      parentBalanceHalalas: committed.parentBalanceHalalas,
      summary: await this.summaries.getSummaryForLink(link),
    };
  }

  getChildSummary(actorId: string, childId: string) {
    return this.access
      .assertParentOf(actorId, childId)
      .then((link) => this.summaries.getSummaryForLink(link));
  }

  getMySummary(actorId: string) {
    return this.access
      .assertLinkedChild(actorId)
      .then((link) => this.summaries.getSummaryForLink(link));
  }

  private async settingsFor(
    linkId: Types.ObjectId,
  ): Promise<AllowanceSettingsDto> {
    const settings = await this.settingsRepo.findByLinkId(linkId);
    if (!settings) throw childNotFound();
    return this.toDto(settings);
  }

  private toDto(
    s: AllowanceSettingsDocument,
    now = new Date(),
  ): AllowanceSettingsDto {
    return {
      childId: s.childUserId.toString(),
      monthlyAmountHalalas: s.monthlyAmountHalalas,
      payoutDay: s.payoutDay,
      dailyLimitHalalas: s.dailyLimitHalalas,
      perPurchaseMaxHalalas: s.perPurchaseMaxHalalas,
      blockedCategories: s.blockedCategories,
      alwaysBlockedCategories: ALWAYS_BLOCKED_CATEGORIES,
      purchaseNotifications: s.purchaseNotifications,
      nextPayoutDate: nextPayoutDate(s.monthlyAmountHalalas, s.payoutDay, now),
      currency: 'SAR',
      updatedAt: (s.updatedAt ?? now).toISOString(),
    };
  }
}
