import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from '../auth/auth.service';
import { PushService } from '../notifications/push.service';
import { CardsRepository } from '../family-core/repositories/cards.repository';
import { AllowanceRequestsRepository } from '../family-core/repositories/allowance-requests.repository';
import { AllowanceRequestDocument } from '../family-core/schemas/allowance-request.schema';
import { CardDocument } from '../family-core/schemas/card.schema';
import {
  FamilyLinkDocument,
  UnlinkReason,
} from '../family-core/schemas/family-link.schema';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { CardsService } from '../cards/cards.service';
import { FamilyAccessService } from '../family-core/family-access.service';
import { FamilyLinksRepository } from '../family-core/repositories/family-links.repository';
import { AllowanceSettingsRepository } from '../family-core/repositories/allowance-settings.repository';
import {
  ChildSummaryService,
  ChildListItemDto,
} from '../family-core/child-summary.service';
import { AllowanceEventsService } from '../family-core/allowance-events.service';
import {
  ALLOWANCE_DEFAULTS,
  MAX_CHILDREN_PER_PARENT,
} from '../family-core/family-core.constants';
import {
  accountIsChild,
  accountIsParent,
  cannotLinkSelf,
  childAlreadyLinked,
  childNotFound,
  linkCodeAlreadyUsed,
  linkCodeInvalidOrExpired,
  linkCodeNotClaimed,
  maxChildrenReached,
} from '../family-core/allowance-errors';
import { isDuplicateKeyError } from '../wallet/ledger.errors';
import { LinkCodeData, LinkCodesService } from './link-codes.service';

const QR_PREFIX = 'cirochat://family/link?c=';

export interface FamilyMeDto {
  role: 'none' | 'parent' | 'child';
  parent: { id: string; name: string; avatarUrl: string } | null;
  children: ChildListItemDto[];
}

/** 026 (FR-001–008): linking, role rules and `GET /family/me`. */
@Injectable()
export class FamilyService {
  private readonly logger = new Logger(FamilyService.name);

  constructor(
    private readonly linkCodes: LinkCodesService,
    private readonly access: FamilyAccessService,
    private readonly links: FamilyLinksRepository,
    private readonly settings: AllowanceSettingsRepository,
    private readonly cards: CardsService,
    private readonly wallet: WalletService,
    private readonly users: UsersService,
    private readonly summaries: ChildSummaryService,
    private readonly events: AllowanceEventsService,
    private readonly cardsRepo: CardsRepository,
    private readonly requestsRepo: AllowanceRequestsRepository,
    private readonly auth: AuthService,
    private readonly push: PushService,
  ) {}

  async createLinkCode(parentId: string) {
    if ((await this.access.getRole(parentId)) === 'child')
      throw accountIsChild();
    if (
      (await this.access.countActiveChildren(parentId)) >=
      MAX_CHILDREN_PER_PARENT
    ) {
      throw maxChildrenReached();
    }
    const { code, data } = await this.linkCodes.create(parentId);
    return {
      code,
      qrPayload: `${QR_PREFIX}${code}`,
      expiresAt: data.expiresAt,
    };
  }

  async getCurrentLinkCode(parentId: string) {
    const current = await this.linkCodes.getCurrentForParent(parentId);
    if (!current) throw linkCodeInvalidOrExpired();
    const child =
      current.data.state === 'claimed' && current.data.childUserId
        ? await this.users.findById(current.data.childUserId)
        : null;
    return {
      state: current.data.state,
      expiresAt: current.data.expiresAt,
      child: child
        ? {
            id: child._id.toString(),
            name: child.name,
            phoneNumber: child.phoneNumber,
          }
        : null,
    };
  }

  async cancelLinkCode(parentId: string): Promise<void> {
    await this.linkCodes.deleteCurrentForParent(parentId);
  }

  /** FR-002: no side effects. */
  async preview(childId: string, code: string) {
    const data = await this.loadClaimableCode(childId, code);
    const parent = await this.users.findById(data.parentUserId);
    return {
      parent: { name: parent?.name ?? '', avatarUrl: parent?.avatarUrl ?? '' },
      expiresAt: data.expiresAt,
    };
  }

  /** The child's confirmation (FR-003). Tells the parent's QR screen. */
  async claim(childId: string, code: string) {
    const data = await this.loadClaimableCode(childId, code);
    const claimed = await this.linkCodes.claim(code, childId);
    const [parent, child] = await Promise.all([
      this.users.findById(data.parentUserId),
      this.users.findById(childId),
    ]);
    this.events.linkClaimed(
      data.parentUserId,
      {
        id: childId,
        name: child?.name ?? '',
        phoneNumber: child?.phoneNumber ?? '',
      },
      claimed.expiresAt,
    );
    return { state: 'claimed' as const, parent: { name: parent?.name ?? '' } };
  }

  async confirm(parentId: string): Promise<{ child: ChildListItemDto }> {
    const current = await this.linkCodes.getCurrentForParent(parentId);
    if (!current) throw linkCodeInvalidOrExpired();
    if (current.data.state !== 'claimed' || !current.data.childUserId) {
      throw linkCodeNotClaimed();
    }
    const childId = current.data.childUserId;
    const childUser = await this.users.findById(childId);
    const issued = await this.cards.issueCardForLink(
      childId,
      childUser?.name ?? '',
    );
    const childConfirmedAt = new Date(current.data.claimedAt ?? Date.now());

    let link;
    try {
      link = await this.wallet.runInTransaction(async (session) => {
        if ((await this.access.getRole(parentId, session)) === 'child')
          throw accountIsChild();
        if (await this.links.findActiveByChild(childId, session))
          throw childAlreadyLinked();
        if ((await this.access.countActiveChildren(childId, session)) > 0)
          throw accountIsParent();
        if (
          (await this.access.countActiveChildren(parentId, session)) >=
          MAX_CHILDREN_PER_PARENT
        ) {
          throw maxChildrenReached();
        }

        const account = await this.wallet.createChildAccount(childId, session);
        const created = await this.links.insert(
          {
            parentUserId: new Types.ObjectId(parentId),
            childUserId: new Types.ObjectId(childId),
            status: 'active',
            childConfirmedAt,
            parentConfirmedAt: new Date(),
            childAccountId: account._id,
            rev: 1,
          },
          session,
        );
        await this.settings.insert(
          {
            linkId: created._id,
            childUserId: created.childUserId,
            parentUserId: created.parentUserId,
            ...ALLOWANCE_DEFAULTS,
            payoutsActiveFromMonth: null,
            updatedBy: created.parentUserId,
          },
          session,
        );
        await this.cards.insertCard(created, issued, session);

        // FR-008: a linked child's own wallet takes no movements.
        const ownWallet = await this.wallet.getOrCreateUserWallet(
          childId,
          session,
        );
        await this.wallet.setFrozen(ownWallet._id, true, session);
        return created;
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) throw childAlreadyLinked();
      throw err;
    }

    await this.linkCodes
      .delete(current.code, parentId)
      .catch((e: Error) =>
        this.logger.warn(
          `Could not delete link code after confirm: ${e.message}`,
        ),
      );
    await this.events.summaryChanged(childId, 'linked', undefined, link);
    return { child: await this.summaries.toChildListItem(link) };
  }

  /**
   * FR-006, US8: one transaction returns the child's whole balance to the
   * parent, cancels a pending request, deactivates the card and unfreezes the
   * child's own wallet. Every record is kept for audit.
   */
  async unlink(
    actorId: string,
    childId: string,
  ): Promise<{ returnedHalalas: number; currency: 'SAR' }> {
    const link = await this.access.assertParentOf(actorId, childId);
    return this.unlinkLink(link, 'parent');
  }

  /**
   * Hook for the future delete-account flow (research F10, nothing calls it
   * yet). A child is unlinked; a parent with children must unlink them first.
   */
  async handleAccountDeletion(userId: string): Promise<{ unlinked: boolean }> {
    const childLink = await this.links.findActiveByChild(userId);
    if (childLink) {
      await this.unlinkLink(childLink, 'child_account_deleted');
      return { unlinked: true };
    }
    if ((await this.access.countActiveChildren(userId)) > 0)
      throw accountIsParent();
    return { unlinked: false };
  }

  private async unlinkLink(
    link: FamilyLinkDocument,
    reason: UnlinkReason,
  ): Promise<{ returnedHalalas: number; currency: 'SAR' }> {
    const childId = link.childUserId.toString();
    const parentId = link.parentUserId.toString();
    let returned = 0;
    let rev = link.rev;
    let cancelled: AllowanceRequestDocument | null = null;
    let card: CardDocument | null = null;

    await this.wallet.runInTransaction(async (session) => {
      // Reset on a retried transaction.
      returned = 0;
      cancelled = null;
      const unlinked = await this.links.markUnlinked(link._id, reason, session);
      if (!unlinked) throw childNotFound(); // another unlink won
      rev = unlinked.rev;

      const balance = await this.wallet.getBalance(
        link.childAccountId,
        session,
      );
      if (balance > 0) {
        const parentWallet = await this.wallet.getOrCreateUserWallet(
          link.parentUserId,
          session,
        );
        await this.wallet.transfer(
          {
            type: EntryType.UNLINK_RETURN,
            fromAccountId: link.childAccountId,
            toAccountId: parentWallet._id,
            amountHalalas: balance,
            idempotencyKey: `unlink:${link._id.toString()}`,
            initiator:
              reason === 'parent'
                ? { kind: 'parent', userId: link.parentUserId }
                : { kind: 'system' },
            refs: { linkId: link._id },
          },
          session,
        );
        returned = balance;
      }

      const pending = await this.requestsRepo.findPendingByLink(
        link._id,
        session,
      );
      if (pending) {
        cancelled = await this.requestsRepo.transition(
          pending._id,
          {
            status: 'cancelled',
            ...(reason === 'parent' ? { resolvedBy: link.parentUserId } : {}),
          },
          session,
        );
      }

      card = await this.cardsRepo.findByLinkId(link._id, session);
      if (card) {
        await this.cardsRepo.setStatus(
          card._id,
          ['active', 'paused'],
          'inactive',
          reason === 'parent' ? link.parentUserId : undefined,
          session,
        );
      }

      const ownWallet = await this.wallet.findUserWallet(childId, session);
      if (ownWallet) await this.wallet.setFrozen(ownWallet._id, false, session);
    });

    // After commit: realtime, pushes, issuer sync, then the watch session.
    if (card)
      await this.cards.enqueueSync((card as CardDocument)._id, 'terminate');
    this.events.unlinked(childId, parentId, rev);
    if (cancelled) await this.events.requestResolved(cancelled, rev);
    if (reason === 'parent') {
      await this.events.notify(
        childId,
        'allowance.unlinked',
        { childId },
        { childId },
      );
    }
    // The watch hears about the unlink first; only then are its session and push tokens removed.
    await this.push.sendWatchRefresh(childId, rev, { force: true });
    await this.auth.revokeDeviceSession(childId, 'unlinked');
    return { returnedHalalas: returned, currency: 'SAR' };
  }

  async getMe(userId: string): Promise<FamilyMeDto> {
    const childLink = await this.links.findActiveByChild(userId);
    if (childLink) {
      const parent = await this.users.findById(
        childLink.parentUserId.toString(),
      );
      return {
        role: 'child',
        parent: {
          id: childLink.parentUserId.toString(),
          name: parent?.name ?? '',
          avatarUrl: parent?.avatarUrl ?? '',
        },
        children: [],
      };
    }
    const links = await this.links.findActiveByParent(userId);
    if (links.length === 0) return { role: 'none', parent: null, children: [] };
    return {
      role: 'parent',
      parent: null,
      children: await Promise.all(
        links.map((l) => this.summaries.toChildListItem(l)),
      ),
    };
  }

  /**
   * Eligibility shared by preview and claim (contracts/rest-api.md):
   * unknown code → CANNOT_LINK_SELF → ALREADY_USED → CHILD_ALREADY_LINKED → ACCOUNT_IS_PARENT.
   */
  private async loadClaimableCode(
    childId: string,
    code: string,
  ): Promise<LinkCodeData> {
    const data = await this.linkCodes.get(code);
    if (!data) throw linkCodeInvalidOrExpired();
    if (data.parentUserId === childId) throw cannotLinkSelf();
    if (data.state === 'claimed') throw linkCodeAlreadyUsed();
    if (await this.links.findActiveByChild(childId)) throw childAlreadyLinked();
    if ((await this.access.countActiveChildren(childId)) > 0)
      throw accountIsParent();
    return data;
  }
}
