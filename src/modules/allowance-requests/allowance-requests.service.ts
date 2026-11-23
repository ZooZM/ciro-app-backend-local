import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { riyadhDate } from '../../common/utils/riyadh-time.util';
import { WalletService } from '../wallet/wallet.service';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import {
  InsufficientBalanceError,
  isDuplicateKeyError,
} from '../wallet/ledger.errors';
import { FamilyAccessService } from '../family-core/family-access.service';
import { FamilyLinksRepository } from '../family-core/repositories/family-links.repository';
import { AllowanceRequestsRepository } from '../family-core/repositories/allowance-requests.repository';
import { DailyLimitBoostsRepository } from '../family-core/repositories/daily-limit-boosts.repository';
import {
  ChildSummaryService,
  AllowanceRequestDto,
} from '../family-core/child-summary.service';
import { AllowanceEventsService } from '../family-core/allowance-events.service';
import { AllowanceRequestDocument } from '../family-core/schemas/allowance-request.schema';
import { fromLedgerEntry } from '../family-core/activity-mapper';
import { REQUEST_TTL_MS } from '../family-core/family-core.constants';
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  Page,
} from '../family-core/pagination';
import {
  approvedAmountInvalid,
  childNotFound,
  insufficientFunds,
  requestAlreadyPending,
  requestAlreadyResolved,
} from '../family-core/allowance-errors';
import { CreateAllowanceRequestDto } from './dto/create-allowance-request.dto';

/** The `allowance-scheduler` queue is shared with the payout jobs (research R14). */
export const REQUEST_SCHEDULER_QUEUE = 'allowance-scheduler';

/**
 * 026 (FR-050–057): a child's request for more money and the parent's answer.
 * Every transition out of `pending` is a guarded `findOneAndUpdate`, so
 * exactly one writer wins; the money move and today's limit boost commit in
 * the same transaction as an approval.
 */
@Injectable()
export class AllowanceRequestsService {
  private readonly logger = new Logger(AllowanceRequestsService.name);

  constructor(
    private readonly access: FamilyAccessService,
    private readonly links: FamilyLinksRepository,
    private readonly requests: AllowanceRequestsRepository,
    private readonly boosts: DailyLimitBoostsRepository,
    private readonly wallet: WalletService,
    private readonly summaries: ChildSummaryService,
    private readonly events: AllowanceEventsService,
    @InjectQueue(REQUEST_SCHEDULER_QUEUE) private readonly queue: Queue,
  ) {}

  // ───────────────────────────── child ─────────────────────────────

  async create(
    actorId: string,
    dto: CreateAllowanceRequestDto,
    now = new Date(),
  ): Promise<AllowanceRequestDto> {
    const link = await this.access.assertLinkedChild(actorId);
    let request: AllowanceRequestDocument;
    try {
      request = await this.wallet.runInTransaction(async (session) => {
        const created = await this.requests.insert(
          {
            childUserId: link.childUserId,
            parentUserId: link.parentUserId,
            linkId: link._id,
            amountHalalas: dto.amountHalalas,
            reason: dto.reason,
            source: dto.source,
            status: 'pending',
            expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
          },
          session,
        );
        await this.links.bumpRev(link._id, session);
        return created;
      });
    } catch (err) {
      // The partial unique index allows one pending request per child (FR-051).
      if (isDuplicateKeyError(err)) {
        const pending = await this.requests.findPendingByChild(
          link.childUserId,
        );
        if (pending)
          throw requestAlreadyPending(await this.summaries.requestDto(pending));
      }
      throw err;
    }

    await this.enqueueExpiry(request);
    const dto2 = await this.events.requestCreated(request);
    const parentVars = {
      childName: dto2?.childName ?? '',
      amountHalalas: request.amountHalalas,
      reason: request.reason,
      childId: actorId,
    };
    // FR-053: always sent, whatever `purchaseNotifications` says.
    await this.events.notify(
      request.parentUserId.toString(),
      'allowance.requestCreated',
      parentVars,
      {
        childId: actorId,
        apnsCategory: 'ALLOWANCE_REQUEST',
        data: { requestId: request._id.toString() },
      },
    );
    return dto2 ?? (await this.summaries.requestDto(request));
  }

  async listMine(
    actorId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<Page<AllowanceRequestDto>> {
    const link = await this.access.assertLinkedChild(actorId);
    const limit = clampLimit(query.limit);
    const rows = await this.requests.listForChild(link.childUserId, {
      before: decodeCursor(query.cursor),
      limit: limit + 1,
    });
    return this.page(rows, limit);
  }

  /** Only the owner can cancel (US5); a second answer gets 409 with the current request. */
  async cancel(
    actorId: string,
    requestId: string,
  ): Promise<AllowanceRequestDto> {
    const request = await this.requests.findById(requestId);
    if (!request || !request.childUserId.equals(actorId)) throw childNotFound();
    await this.access.assertLinkedChild(actorId);

    const cancelled = await this.wallet.runInTransaction(async (session) => {
      const done = await this.requests.transition(
        request._id,
        { status: 'cancelled', resolvedBy: new Types.ObjectId(actorId) },
        session,
      );
      if (done) await this.links.bumpRev(request.linkId, session);
      return done;
    });
    if (!cancelled)
      throw requestAlreadyResolved(await this.currentDto(request._id));
    return (
      (await this.events.requestResolved(cancelled)) ??
      this.summaries.requestDto(cancelled)
    );
  }

  // ───────────────────────────── parent ─────────────────────────────

  async listForParent(
    actorId: string,
    query: { status?: 'pending' | 'resolved'; cursor?: string; limit?: number },
  ): Promise<Page<AllowanceRequestDto>> {
    const limit = clampLimit(query.limit);
    const rows = await this.requests.listForParent(
      new Types.ObjectId(actorId),
      {
        status: query.status,
        before: decodeCursor(query.cursor),
        limit: limit + 1,
      },
    );
    return this.page(rows, limit);
  }

  /**
   * Full amount → `approved`; 0 < x < amount → `partially_approved`; anything
   * else → 400. Moves the money and raises TODAY's limit (FR-055) in one
   * transaction. Too little in the wallet aborts it and the request stays pending.
   */
  async approve(
    actorId: string,
    requestId: string,
    input: { amountHalalas: number; note?: string },
    now = new Date(),
  ) {
    const request = await this.ownedRequest(actorId, requestId);
    if (request.status !== 'pending')
      throw requestAlreadyResolved(await this.summaries.requestDto(request));
    const approved = input.amountHalalas;
    if (
      !Number.isSafeInteger(approved) ||
      approved < 1 ||
      approved > request.amountHalalas
    ) {
      throw approvedAmountInvalid();
    }
    const link = await this.access.assertParentOf(
      actorId,
      request.childUserId.toString(),
    );

    let resolved: AllowanceRequestDocument;
    let entry;
    try {
      ({ resolved, entry } = await this.wallet.runInTransaction(
        async (session) => {
          const parentWallet = await this.wallet.getOrCreateUserWallet(
            actorId,
            session,
          );
          const posted = await this.wallet.transfer(
            {
              type: EntryType.REQUEST_APPROVAL,
              fromAccountId: parentWallet._id,
              toAccountId: link.childAccountId,
              amountHalalas: approved,
              idempotencyKey: `request:${request._id.toString()}`,
              initiator: {
                kind: 'parent',
                userId: new Types.ObjectId(actorId),
              },
              refs: { linkId: link._id, requestId: request._id },
              riyadhDate: riyadhDate(now),
            },
            session,
          );
          const done = await this.requests.transition(
            request._id,
            {
              status:
                approved === request.amountHalalas
                  ? 'approved'
                  : 'partially_approved',
              approvedAmountHalalas: approved,
              parentNote: input.note?.trim() || undefined,
              resolvedBy: new Types.ObjectId(actorId),
              ledgerEntryId: posted.entry._id,
            },
            session,
          );
          // Lost the race to another answer: abort so the ledger entry rolls back too.
          if (!done) throw requestAlreadyResolved(null);
          await this.boosts.addBoost(
            request.childUserId,
            riyadhDate(now),
            approved,
            request._id,
            session,
          );
          await this.links.bumpRev(link._id, session);
          return { resolved: done, entry: posted.entry };
        },
      ));
    } catch (err) {
      if (err instanceof InsufficientBalanceError) throw insufficientFunds();
      if (
        (err as { getResponse?: () => { error?: string } }).getResponse?.()
          .error === 'REQUEST_ALREADY_RESOLVED'
      ) {
        throw requestAlreadyResolved(await this.currentDto(request._id));
      }
      throw err;
    }

    const dto =
      (await this.events.requestResolved(resolved)) ??
      (await this.summaries.requestDto(resolved));
    const childId = request.childUserId.toString();
    await this.events.summaryChanged(
      childId,
      'request_approved',
      fromLedgerEntry(entry) ?? undefined,
      link,
    );
    await this.events.notify(
      childId,
      'allowance.requestResolved',
      {
        status: resolved.status,
        approvedAmountHalalas: approved,
        note: resolved.parentNote ?? null,
        childId,
      },
      { childId, data: { requestId: request._id.toString() } },
    );
    return {
      request: dto,
      summary: await this.summaries.getSummaryForLink(link),
    };
  }

  async decline(actorId: string, requestId: string, input: { note?: string }) {
    const request = await this.ownedRequest(actorId, requestId);
    if (request.status !== 'pending')
      throw requestAlreadyResolved(await this.summaries.requestDto(request));
    const declined = await this.wallet.runInTransaction(async (session) => {
      const done = await this.requests.transition(
        request._id,
        {
          status: 'declined',
          parentNote: input.note?.trim() || undefined,
          resolvedBy: new Types.ObjectId(actorId),
        },
        session,
      );
      if (done) await this.links.bumpRev(request.linkId, session);
      return done;
    });
    if (!declined)
      throw requestAlreadyResolved(await this.currentDto(request._id));

    const dto =
      (await this.events.requestResolved(declined)) ??
      (await this.summaries.requestDto(declined));
    const childId = request.childUserId.toString();
    await this.events.notify(
      childId,
      'allowance.requestResolved',
      { status: 'declined', note: declined.parentNote ?? null, childId },
      { childId, data: { requestId: request._id.toString() } },
    );
    return { request: dto };
  }

  // ───────────────────────────── expiry ─────────────────────────────

  /** 24 h without an answer (FR-052). A no-op if it was answered meanwhile. */
  async expire(requestId: string): Promise<boolean> {
    const request = await this.requests.findById(requestId);
    if (!request || request.status !== 'pending') return false;
    const expired = await this.wallet.runInTransaction(async (session) => {
      const done = await this.requests.transition(
        request._id,
        { status: 'expired' },
        session,
      );
      if (done) await this.links.bumpRev(request.linkId, session);
      return done;
    });
    if (!expired) return false;
    await this.events.requestResolved(expired);
    const childId = request.childUserId.toString();
    await this.events.notify(
      childId,
      'allowance.requestExpired',
      { childId },
      { childId, data: { requestId: request._id.toString() } },
    );
    return true;
  }

  /** Backs up the per-request delayed job. Returns how many were expired. */
  async expireOverdue(
    asOf: Date,
    childIds?: Types.ObjectId[],
  ): Promise<number> {
    const overdue = await this.requests.findOverdue(asOf, childIds);
    let count = 0;
    for (const r of overdue) {
      try {
        if (await this.expire(r._id.toString())) count++;
      } catch (err) {
        this.logger.warn(
          `expire(${r._id.toString()}) failed: ${(err as Error).message}`,
        );
      }
    }
    return count;
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private async enqueueExpiry(
    request: AllowanceRequestDocument,
  ): Promise<void> {
    try {
      await this.queue.add(
        'request-expire',
        { requestId: request._id.toString() },
        {
          jobId: `request-expire-${request._id.toString()}`,
          delay: Math.max(0, request.expiresAt.getTime() - Date.now()),
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
        },
      );
    } catch (err) {
      // The 10-minute sweep expires it anyway.
      this.logger.warn(
        `Could not schedule expiry for ${request._id.toString()}: ${(err as Error).message}`,
      );
    }
  }

  /** The request must exist and belong to this parent's active child, else 404 (no probing). */
  private async ownedRequest(
    actorId: string,
    requestId: string,
  ): Promise<AllowanceRequestDocument> {
    const request = await this.requests.findById(requestId);
    if (!request || !request.parentUserId.equals(actorId))
      throw childNotFound();
    await this.access.assertParentOf(actorId, request.childUserId.toString());
    return request;
  }

  private async currentDto(
    id: Types.ObjectId,
  ): Promise<AllowanceRequestDto | null> {
    const current = await this.requests.findById(id);
    return current ? this.summaries.requestDto(current) : null;
  }

  private async page(
    rows: AllowanceRequestDocument[],
    limit: number,
  ): Promise<Page<AllowanceRequestDto>> {
    const slice = rows.slice(0, limit);
    const items = await Promise.all(
      slice.map((r) => this.summaries.requestDto(r)),
    );
    const last = slice[slice.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor(last.createdAt ?? new Date(0), last._id)
          : null,
    };
  }
}
