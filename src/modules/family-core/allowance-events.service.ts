import { Injectable, Logger } from '@nestjs/common';
import { ChatGateway } from '../chat/chat.gateway';
import { PushService, PushAudience } from '../notifications/push.service';
import { FamilyLinksRepository } from './repositories/family-links.repository';
import {
  ChildSummaryService,
  AllowanceRequestDto,
} from './child-summary.service';
import { FamilyLinkDocument } from './schemas/family-link.schema';
import { AllowanceRequestDocument } from './schemas/allowance-request.schema';
import { SummaryChangeReason } from './family-core.constants';
import { ActivityItemDto } from './activity-item';
import {
  renderTemplate,
  TemplateVars,
} from './allowance-notification.templates';

export const SOCKET_EVENTS = {
  allowanceUpdated: 'allowanceUpdated',
  allowanceRequestCreated: 'allowanceRequestCreated',
  allowanceRequestResolved: 'allowanceRequestResolved',
  familyLinkClaimed: 'familyLinkClaimed',
} as const;

/**
 * 026 (contracts/socket-events.md, push-notifications.md): realtime and
 * push fan-out. Called only after a transaction commits. Every method
 * catches and logs its own errors: a failed emit never fails the request,
 * because clients recover on their next REST fetch.
 */
@Injectable()
export class AllowanceEventsService {
  private readonly logger = new Logger(AllowanceEventsService.name);

  constructor(
    private readonly gateway: ChatGateway,
    private readonly push: PushService,
    private readonly links: FamilyLinksRepository,
    private readonly summaries: ChildSummaryService,
  ) {}

  /** Builds the fresh summary and emits `allowanceUpdated` to the child and the active parent. */
  async summaryChanged(
    childId: string,
    reason: SummaryChangeReason,
    activityItem?: ActivityItemDto,
    link?: FamilyLinkDocument | null,
  ): Promise<void> {
    try {
      const active = link ?? (await this.links.findActiveByChild(childId));
      if (!active || active.status !== 'active') return;
      const summary = await this.summaries.getSummaryForLink(active);
      const payload = {
        childId,
        rev: summary.rev,
        reason,
        summary,
        ...(activityItem ? { transaction: activityItem } : {}),
      };
      this.gateway.emitToUser(childId, SOCKET_EVENTS.allowanceUpdated, payload);
      this.gateway.emitToUser(
        active.parentUserId.toString(),
        SOCKET_EVENTS.allowanceUpdated,
        payload,
      );
      this.onChildChanged(childId, summary.rev);
    } catch (err) {
      this.logger.warn(
        `summaryChanged(${childId}, ${reason}) failed: ${(err as Error).message}`,
      );
    }
  }

  /** `allowanceUpdated{reason:'unlinked', summary:null}` to the child and the former parent (US8). */
  unlinked(childId: string, formerParentId: string, rev: number): void {
    const payload = {
      childId,
      rev,
      reason: 'unlinked' as const,
      summary: null,
    };
    this.gateway.emitToUser(childId, SOCKET_EVENTS.allowanceUpdated, payload);
    this.gateway.emitToUser(
      formerParentId,
      SOCKET_EVENTS.allowanceUpdated,
      payload,
    );
    this.onChildChanged(childId, rev);
  }

  async requestCreated(
    request: AllowanceRequestDocument,
  ): Promise<AllowanceRequestDto | null> {
    try {
      const dto = await this.summaries.requestDto(request);
      const rev = await this.currentRev(request.childUserId.toString());
      this.gateway.emitToUser(
        request.parentUserId.toString(),
        SOCKET_EVENTS.allowanceRequestCreated,
        {
          childId: dto.childId,
          rev,
          request: dto,
        },
      );
      return dto;
    } catch (err) {
      this.logger.warn(`requestCreated failed: ${(err as Error).message}`);
      return null;
    }
  }

  async requestResolved(
    request: AllowanceRequestDocument,
    knownRev?: number,
  ): Promise<AllowanceRequestDto | null> {
    try {
      const dto = await this.summaries.requestDto(request);
      const childId = request.childUserId.toString();
      const rev = knownRev ?? (await this.currentRev(childId));
      const payload = { childId, rev, request: dto };
      this.gateway.emitToUser(
        childId,
        SOCKET_EVENTS.allowanceRequestResolved,
        payload,
      );
      this.gateway.emitToUser(
        request.parentUserId.toString(),
        SOCKET_EVENTS.allowanceRequestResolved,
        payload,
      );
      this.onChildChanged(childId, rev);
      return dto;
    } catch (err) {
      this.logger.warn(`requestResolved failed: ${(err as Error).message}`);
      return null;
    }
  }

  linkClaimed(
    parentId: string,
    child: { id: string; name: string; phoneNumber: string },
    expiresAt: string,
  ): void {
    this.gateway.emitToUser(parentId, SOCKET_EVENTS.familyLinkClaimed, {
      child,
      expiresAt,
    });
  }

  /** Localized push through the template registry. */
  async notify(
    userId: string,
    type: string,
    vars: TemplateVars,
    options: {
      audience?: PushAudience;
      data?: Record<string, string | number | null | undefined>;
      childId?: string;
      apnsCategory?: string;
    } = {},
  ): Promise<void> {
    try {
      const childId = options.childId ?? (vars.childId as string | undefined);
      // A push aimed at the child also refreshes their watch.
      if (childId && userId === childId)
        void this.push.sendWatchRefresh(childId);
      await this.push.sendToUser(
        userId,
        {
          type,
          data: { ...(childId ? { childId } : {}), ...options.data },
          render: (locale) => renderTemplate(type, vars, locale),
          apnsCategory: options.apnsCategory,
          threadId: childId ? `allowance:${childId}` : undefined,
          androidChannelId: 'allowance',
        },
        { audience: options.audience ?? 'phone' },
      );
    } catch (err) {
      this.logger.warn(`notify(${type}) failed: ${(err as Error).message}`);
    }
  }

  /** Every child `allowanceUpdated` and request resolution also refreshes the child's watch (R9). */
  protected onChildChanged(childId: string, rev: number): void {
    void this.push.sendWatchRefresh(childId, rev);
  }

  private async currentRev(childId: string): Promise<number> {
    const link = await this.links.findActiveByChild(childId);
    return link?.rev ?? 0;
  }
}
