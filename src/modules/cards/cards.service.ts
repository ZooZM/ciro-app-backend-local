import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ClientSession, Types } from 'mongoose';
import { WalletService } from '../wallet/wallet.service';
import { CardsRepository } from '../family-core/repositories/cards.repository';
import { FamilyLinksRepository } from '../family-core/repositories/family-links.repository';
import { FamilyAccessService } from '../family-core/family-access.service';
import { AllowanceEventsService } from '../family-core/allowance-events.service';
import { FamilyLinkDocument } from '../family-core/schemas/family-link.schema';
import { CardDocument } from '../family-core/schemas/card.schema';
import { cardInactive, notALinkedChild } from '../family-core/allowance-errors';
import { IssuedCard, ISSUER_PROVIDER } from './issuer/issuer-provider';
import type { IssuerProvider } from './issuer/issuer-provider';

export const CARD_SYNC_QUEUE = 'card-sync';
export type CardSyncOp = 'freeze' | 'unfreeze' | 'terminate';

export interface CardDto {
  cardId: string;
  last4: string;
  status: 'active' | 'paused' | 'inactive';
  provider: string;
}

/**
 * 026: card lifecycle on our side. Our database decides every authorization;
 * the issuer is kept in sync after commit through the `card-sync` queue
 * (defence in depth), with retries.
 */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly cards: CardsRepository,
    private readonly links: FamilyLinksRepository,
    private readonly access: FamilyAccessService,
    private readonly wallet: WalletService,
    private readonly events: AllowanceEventsService,
    @InjectQueue(CARD_SYNC_QUEUE) private readonly syncQueue: Queue,
    @Inject(ISSUER_PROVIDER) private readonly issuer: IssuerProvider,
  ) {}

  /**
   * Called BEFORE the link transaction starts: an issuer call must not run
   * inside a database transaction. If the transaction later fails, the
   * issued card is simply never stored.
   */
  issueCardForLink(
    childUserId: string,
    displayName: string,
  ): Promise<IssuedCard> {
    return this.issuer.issueCard({ childUserId, displayName });
  }

  /** Stores the issued card as `active`, inside the link transaction. */
  insertCard(
    link: FamilyLinkDocument,
    issued: IssuedCard,
    session: ClientSession,
  ): Promise<CardDocument> {
    return this.cards.insert(
      {
        childUserId: link.childUserId,
        linkId: link._id,
        provider: this.issuer.name,
        cardRef: issued.cardRef,
        last4: issued.last4,
        status: 'active',
        statusChangedAt: new Date(),
      },
      session,
    );
  }

  async getCard(actorId: string, childId: string): Promise<CardDto> {
    const link = await this.access.assertParentOf(actorId, childId);
    return this.cardFor(link);
  }

  async getMyCard(actorId: string): Promise<CardDto> {
    const link = await this.access.assertLinkedChild(actorId);
    return this.cardFor(link);
  }

  /** FR-059: takes effect on the very next authorization. */
  pause(actorId: string, childId: string) {
    return this.setStatus(actorId, childId, 'paused');
  }

  resume(actorId: string, childId: string) {
    return this.setStatus(actorId, childId, 'active');
  }

  /** Enqueues the issuer sync after commit; failures are retried by the queue. */
  async enqueueSync(
    cardId: Types.ObjectId | string,
    op: CardSyncOp,
  ): Promise<void> {
    try {
      await this.syncQueue.add(
        `card-sync:${cardId.toString()}:${op}`,
        { cardId: cardId.toString(), op },
        {
          jobId: `card-sync-${cardId.toString()}-${op}-${Date.now()}`,
          attempts: 6,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Could not enqueue card sync ${op} for ${cardId.toString()}: ${(err as Error).message}`,
      );
    }
  }

  private async setStatus(
    actorId: string,
    childId: string,
    target: 'active' | 'paused',
  ): Promise<{ status: string }> {
    const link = await this.access.assertParentOf(actorId, childId);
    const card = await this.cards.findByLinkId(link._id);
    if (!card) throw notALinkedChild();
    if (card.status === 'inactive') throw cardInactive();
    if (card.status === target) return { status: target };

    const from =
      target === 'paused' ? ['active' as const] : ['paused' as const];
    const changed = await this.wallet.runInTransaction(async (session) => {
      const updated = await this.cards.setStatus(
        card._id,
        from,
        target,
        new Types.ObjectId(actorId),
        session,
      );
      if (updated) await this.links.bumpRev(link._id, session);
      return updated;
    });
    if (!changed)
      return {
        status: (await this.cards.findById(card._id))?.status ?? target,
      };

    const paused = target === 'paused';
    await this.events.summaryChanged(
      childId,
      paused ? 'card_paused' : 'card_resumed',
      undefined,
      link,
    );
    await this.events.notify(
      childId,
      paused ? 'allowance.cardPaused' : 'allowance.cardResumed',
      { childId },
      { childId },
    );
    await this.enqueueSync(card._id, paused ? 'freeze' : 'unfreeze');
    return { status: target };
  }

  private async cardFor(link: FamilyLinkDocument): Promise<CardDto> {
    const card = await this.cards.findByLinkId(link._id);
    if (!card) throw notALinkedChild();
    return {
      cardId: card._id.toString(),
      last4: card.last4,
      status: card.status,
      provider: card.provider,
    };
  }
}
