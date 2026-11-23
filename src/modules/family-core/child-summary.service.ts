import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  addMonths,
  currentAllowanceWindow,
  effectivePayoutDate,
  riyadhDate,
  riyadhDayStartUtc,
  AllowanceWindow,
} from '../../common/utils/riyadh-time.util';
import {
  envInt,
  MAX_REQUEST_DEFAULT,
  MAX_REQUEST_ENV,
} from '../../common/decorators/max-from-env.decorator';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { LedgerEntriesRepository } from '../wallet/repositories/ledger-entries.repository';
import {
  EntryType,
  LedgerEntryDocument,
} from '../wallet/schemas/ledger-entry.schema';
import { FamilyLinksRepository } from './repositories/family-links.repository';
import { AllowanceSettingsRepository } from './repositories/allowance-settings.repository';
import { CardsRepository } from './repositories/cards.repository';
import { AllowanceRequestsRepository } from './repositories/allowance-requests.repository';
import { AllowancePayoutsRepository } from './repositories/allowance-payouts.repository';
import { DailyLimitBoostsRepository } from './repositories/daily-limit-boosts.repository';
import { SpendCounterService } from './spend-counter.service';
import {
  availableToday,
  effectiveDailyLimit,
  leftThisMonth,
  nextDay,
} from './allowance-math';
import { FamilyLinkDocument } from './schemas/family-link.schema';
import { AllowanceSettingsDocument } from './schemas/allowance-settings.schema';
import { AllowanceRequestDocument } from './schemas/allowance-request.schema';
import {
  ALLOWANCE_DEFAULTS,
  CardStatus,
  RequestReason,
  RequestSource,
  RequestStatus,
} from './family-core.constants';
import { notALinkedChild } from './allowance-errors';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AllowanceRequestDto {
  id: string;
  childId: string;
  childName: string;
  amountHalalas: number;
  currency: 'SAR';
  reason: RequestReason;
  source: RequestSource;
  status: RequestStatus;
  approvedAmountHalalas: number | null;
  parentNote: string | null;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  exceedsPerPurchaseMax: boolean;
}

export interface FailedPayoutDto {
  payoutId: string;
  month: string;
  amountHalalas: number;
  failureReason: string;
  payableUntil: string;
}

/** contracts/rest-api.md `ChildSummary` (FR-070, FR-080). */
export interface ChildSummaryDto {
  childId: string;
  childName: string;
  rev: number;
  currency: 'SAR';
  balanceHalalas: number;
  spentTodayHalalas: number;
  effectiveDailyLimitHalalas: number;
  availableTodayHalalas: number;
  spentThisMonthHalalas: number;
  allowancePaidThisMonthHalalas: number;
  leftThisMonthHalalas: number;
  allowanceWindow: AllowanceWindow;
  cardStatus: CardStatus;
  pendingRequest: AllowanceRequestDto | null;
  lastResolvedRequest: AllowanceRequestDto | null;
  failedPayout: FailedPayoutDto | null;
  limits: {
    dailyLimitHalalas: number;
    perPurchaseMaxHalalas: number;
    maxRequestHalalas: number;
  };
  nextDay: { startsAt: string; availableTodayHalalas: number };
  updatedAt: string;
}

/** contracts/rest-api.md `ChildListItem`. */
export interface ChildListItemDto {
  childId: string;
  name: string;
  phoneNumber: string;
  avatarUrl: string;
  rev: number;
  balanceHalalas: number;
  spentTodayHalalas: number;
  currency: 'SAR';
  cardStatus: CardStatus;
  hasPendingRequest: boolean;
}

type SettingsLike = Pick<
  AllowanceSettingsDocument,
  | 'monthlyAmountHalalas'
  | 'payoutDay'
  | 'dailyLimitHalalas'
  | 'perPurchaseMaxHalalas'
>;

/** Net effect of a window's entries on the child account (data-model §3). */
export function windowTotals(
  entries: Pick<
    LedgerEntryDocument,
    'type' | 'amountHalalas' | 'debitAccountId' | 'creditAccountId'
  >[],
  childAccountId: Types.ObjectId,
): { paid: number; spent: number } {
  let paid = 0;
  let spent = 0;
  for (const e of entries) {
    const outOfChild = e.debitAccountId.equals(childAccountId);
    switch (e.type) {
      case EntryType.ALLOWANCE_PAYOUT:
        if (!outOfChild) paid += e.amountHalalas;
        break;
      case EntryType.PURCHASE:
        spent += e.amountHalalas;
        break;
      case EntryType.REFUND:
      case EntryType.PURCHASE_REVERSAL:
        if (!outOfChild) spent -= e.amountHalalas;
        break;
      case EntryType.CLEARING_ADJUSTMENT:
        spent += outOfChild ? e.amountHalalas : -e.amountHalalas;
        break;
      default:
        break;
    }
  }
  return { paid, spent: Math.max(0, spent) };
}

/**
 * 026 (T045): the read model every client shows. Built after a transaction
 * commits and sent with `allowanceUpdated`, or on a REST read.
 */
@Injectable()
export class ChildSummaryService {
  constructor(
    private readonly links: FamilyLinksRepository,
    private readonly settingsRepo: AllowanceSettingsRepository,
    private readonly cards: CardsRepository,
    private readonly requests: AllowanceRequestsRepository,
    private readonly payouts: AllowancePayoutsRepository,
    private readonly boosts: DailyLimitBoostsRepository,
    private readonly spendCounter: SpendCounterService,
    private readonly wallet: WalletService,
    private readonly entries: LedgerEntriesRepository,
    private readonly users: UsersService,
  ) {}

  async getSummary(
    childUserId: string,
    now = new Date(),
  ): Promise<ChildSummaryDto> {
    const link = await this.links.findActiveByChild(childUserId);
    if (!link) throw notALinkedChild();
    return this.getSummaryForLink(link, now);
  }

  async getSummaryForLink(
    link: FamilyLinkDocument,
    now = new Date(),
  ): Promise<ChildSummaryDto> {
    const childId = link.childUserId;
    const today = riyadhDate(now);
    const settings: SettingsLike =
      (await this.settingsRepo.findByLinkId(link._id)) ?? ALLOWANCE_DEFAULTS;

    const [
      fresh,
      balance,
      spentToday,
      boost,
      card,
      pending,
      lastResolved,
      failed,
      user,
    ] = await Promise.all([
      this.links.findById(link._id),
      this.wallet.getBalance(link.childAccountId),
      this.spendCounter.get(childId.toString(), today),
      this.boosts.amountFor(childId, today),
      this.cards.findByLinkId(link._id),
      this.requests.findPendingByLink(link._id),
      this.requests.findLastResolvedSince(
        childId,
        link._id,
        new Date(now.getTime() - DAY_MS),
      ),
      this.payouts.findLatestFailed(childId, link._id),
      this.users.findById(childId.toString()),
    ]);

    const window = currentAllowanceWindow(
      settings.monthlyAmountHalalas > 0 ? settings.payoutDay : null,
      now,
    );
    const windowEntries = await this.entries.findForAccount(
      link.childAccountId,
      {
        fromDate: window.from,
        toDate: window.to,
        since: link.createdAt,
      },
    );
    const { paid, spent } = windowTotals(windowEntries, link.childAccountId);
    const effective = effectiveDailyLimit(settings.dailyLimitHalalas, boost);
    const childName = user?.name ?? '';

    return {
      childId: childId.toString(),
      childName,
      rev: fresh?.rev ?? link.rev,
      currency: 'SAR',
      balanceHalalas: balance,
      spentTodayHalalas: spentToday,
      effectiveDailyLimitHalalas: effective,
      availableTodayHalalas: availableToday(effective, spentToday, balance),
      spentThisMonthHalalas: spent,
      allowancePaidThisMonthHalalas: paid,
      leftThisMonthHalalas: leftThisMonth(paid, spent),
      allowanceWindow: window,
      cardStatus: card?.status ?? 'inactive',
      pendingRequest: pending
        ? this.toAllowanceRequestDto(pending, settings, childName)
        : null,
      lastResolvedRequest: lastResolved
        ? this.toAllowanceRequestDto(lastResolved, settings, childName)
        : null,
      failedPayout: this.failedPayoutDto(failed, settings, now),
      limits: {
        dailyLimitHalalas: settings.dailyLimitHalalas,
        perPurchaseMaxHalalas: settings.perPurchaseMaxHalalas,
        maxRequestHalalas: envInt(MAX_REQUEST_ENV, MAX_REQUEST_DEFAULT),
      },
      nextDay: nextDay(settings.dailyLimitHalalas, balance, now),
      updatedAt: now.toISOString(),
    };
  }

  /** FR-032: Pay now is offered until the next payout date. */
  private failedPayoutDto(
    payout: Awaited<ReturnType<AllowancePayoutsRepository['findLatestFailed']>>,
    settings: SettingsLike,
    now: Date,
  ): FailedPayoutDto | null {
    if (!payout) return null;
    const payableUntil = riyadhDayStartUtc(
      effectivePayoutDate(addMonths(payout.month, 1), settings.payoutDay),
    );
    if (now >= payableUntil) return null;
    return {
      payoutId: payout._id.toString(),
      month: payout.month,
      amountHalalas: payout.amountHalalas,
      failureReason: payout.failureReason ?? 'INSUFFICIENT_FUNDS',
      payableUntil: payableUntil.toISOString(),
    };
  }

  async toChildListItem(
    link: FamilyLinkDocument,
    now = new Date(),
  ): Promise<ChildListItemDto> {
    const childId = link.childUserId;
    const [user, balance, spentToday, card, pending] = await Promise.all([
      this.users.findById(childId.toString()),
      this.wallet.getBalance(link.childAccountId),
      this.spendCounter.get(childId.toString(), riyadhDate(now)),
      this.cards.findByLinkId(link._id),
      this.requests.findPendingByLink(link._id),
    ]);
    return {
      childId: childId.toString(),
      name: user?.name ?? '',
      phoneNumber: user?.phoneNumber ?? '',
      avatarUrl: user?.avatarUrl ?? '',
      rev: link.rev,
      balanceHalalas: balance,
      spentTodayHalalas: spentToday,
      currency: 'SAR',
      cardStatus: card?.status ?? 'inactive',
      hasPendingRequest: Boolean(pending),
    };
  }

  toAllowanceRequestDto(
    request: AllowanceRequestDocument,
    settings: Pick<SettingsLike, 'perPurchaseMaxHalalas'> | null,
    childName: string,
  ): AllowanceRequestDto {
    return {
      id: request._id.toString(),
      childId: request.childUserId.toString(),
      childName,
      amountHalalas: request.amountHalalas,
      currency: 'SAR',
      reason: request.reason,
      source: request.source,
      status: request.status,
      approvedAmountHalalas: request.approvedAmountHalalas ?? null,
      parentNote: request.parentNote ?? null,
      createdAt: (request.createdAt ?? new Date()).toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      resolvedAt: request.resolvedAt ? request.resolvedAt.toISOString() : null,
      exceedsPerPurchaseMax: settings
        ? request.amountHalalas > settings.perPurchaseMaxHalalas
        : false,
    };
  }

  /** Request DTO with the child's name and current settings looked up. */
  async requestDto(
    request: AllowanceRequestDocument,
  ): Promise<AllowanceRequestDto> {
    const [settings, user] = await Promise.all([
      this.settingsRepo.findByLinkId(request.linkId),
      this.users.findById(request.childUserId.toString()),
    ]);
    return this.toAllowanceRequestDto(request, settings, user?.name ?? '');
  }
}
