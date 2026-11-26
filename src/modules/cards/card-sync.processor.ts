import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CardsRepository } from '../family-core/repositories/cards.repository';
import { CARD_SYNC_QUEUE, CardSyncOp } from './cards.service';
import { ISSUER_PROVIDER } from './issuer/issuer-provider';
import type { IssuerProvider } from './issuer/issuer-provider';

/**
 * 026 (contracts/issuer-provider.md): keeps the issuer in sync after our own
 * status changes. A thrown error makes BullMQ retry with backoff; our
 * database stays the source of truth meanwhile.
 */
@Processor(CARD_SYNC_QUEUE)
export class CardSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CardSyncProcessor.name);

  constructor(
    private readonly cards: CardsRepository,
    @Inject(ISSUER_PROVIDER) private readonly issuer: IssuerProvider,
  ) {
    super();
  }

  async process(job: Job<{ cardId: string; op: CardSyncOp }>): Promise<void> {
    const { cardId, op } = job.data;
    const card = await this.cards.findById(cardId);
    if (!card) {
      this.logger.warn(`card-sync ${op}: card ${cardId} not found`);
      return;
    }
    if (op === 'freeze') await this.issuer.freezeCard(card.cardRef);
    else if (op === 'unfreeze') await this.issuer.unfreezeCard(card.cardRef);
    else await this.issuer.terminateCard(card.cardRef);
  }
}
