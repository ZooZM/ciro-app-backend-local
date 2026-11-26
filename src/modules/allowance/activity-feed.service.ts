import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { LedgerEntriesRepository } from '../wallet/repositories/ledger-entries.repository';
import { FamilyAccessService } from '../family-core/family-access.service';
import { CardTransactionsRepository } from '../family-core/repositories/card-transactions.repository';
import { AllowanceRequestsRepository } from '../family-core/repositories/allowance-requests.repository';
import { AllowancePayoutsRepository } from '../family-core/repositories/allowance-payouts.repository';
import { FamilyLinkDocument } from '../family-core/schemas/family-link.schema';
import { ActivityItemDto } from '../family-core/activity-item';
import {
  fromCardTransaction,
  fromFailedPayout,
  fromLedgerEntry,
  fromRequest,
  LEDGER_ACTIVITY_TYPES,
} from '../family-core/activity-mapper';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  Page,
} from '../family-core/pagination';

interface Row {
  at: Date;
  id: Types.ObjectId;
  item: ActivityItemDto;
}

/**
 * 026 (FR-043, FR-070, FR-080): the child's activity list. Merges ledger
 * entries, card rows (including declines), resolved requests and failed
 * payouts into `ActivityItem`s, newest first, with one opaque cursor.
 * It never shows rows from before the current link was created.
 */
@Injectable()
export class ActivityFeedService {
  constructor(
    private readonly access: FamilyAccessService,
    private readonly entries: LedgerEntriesRepository,
    private readonly cardTransactions: CardTransactionsRepository,
    private readonly requests: AllowanceRequestsRepository,
    private readonly payouts: AllowancePayoutsRepository,
  ) {}

  async forParent(
    actorId: string,
    childId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<Page<ActivityItemDto>> {
    const link = await this.access.assertParentOf(actorId, childId);
    return this.feed(link, query);
  }

  async forChild(
    actorId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<Page<ActivityItemDto>> {
    const link = await this.access.assertLinkedChild(actorId);
    return this.feed(link, query);
  }

  async feed(
    link: FamilyLinkDocument,
    query: { cursor?: string; limit?: number },
  ): Promise<Page<ActivityItemDto>> {
    const limit = clampLimit(query.limit);
    const before = decodeCursor(query.cursor);
    const since = link.createdAt;
    const childId = link.childUserId;
    const fetch = limit + 1;

    const [ledger, cards, resolved, failed] = await Promise.all([
      this.entries.findForAccount(link.childAccountId, {
        types: LEDGER_ACTIVITY_TYPES,
        since,
        before: before
          ? { createdAt: before.createdAt, id: before.id }
          : undefined,
        limit: fetch,
      }),
      this.cardTransactions.findFeed(childId, { since, before, limit: fetch }),
      this.requests.findResolvedForActivity(childId, {
        since,
        before,
        limit: fetch,
      }),
      this.payouts.findFailedForActivity(childId, {
        since,
        before,
        limit: fetch,
      }),
    ]);

    const approvalIds = ledger
      .filter((e) => e.type === EntryType.REQUEST_APPROVAL && e.refs?.requestId)
      .map((e) => e.refs.requestId!);
    const approvals = approvalIds.length
      ? await this.requests.findByIds(approvalIds)
      : [];
    const noteByRequest = new Map(
      approvals.map((r) => [r._id.toString(), r.parentNote ?? null]),
    );

    const rows: Row[] = [];
    for (const e of ledger) {
      const item = fromLedgerEntry(
        e,
        e.refs?.requestId
          ? noteByRequest.get(e.refs.requestId.toString())
          : null,
      );
      if (item) rows.push({ at: e.createdAt ?? new Date(0), id: e._id, item });
    }
    for (const c of cards)
      rows.push({
        at: c.createdAt ?? new Date(0),
        id: c._id,
        item: fromCardTransaction(c),
      });
    for (const r of resolved) {
      const item = fromRequest(r);
      if (item)
        rows.push({
          at: r.resolvedAt ?? r.createdAt ?? new Date(0),
          id: r._id,
          item,
        });
    }
    for (const p of failed)
      rows.push({
        at: p.failedAt ?? p.createdAt ?? new Date(0),
        id: p._id,
        item: fromFailedPayout(p),
      });

    rows.sort(
      (a, b) =>
        b.at.getTime() - a.at.getTime() ||
        b.id.toHexString().localeCompare(a.id.toHexString()),
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => r.item),
      nextCursor:
        rows.length > limit && last ? encodeCursor(last.at, last.id) : null,
    };
  }
}
