import { Inject, Injectable, Logger } from '@nestjs/common';
import { CardsRepository } from '../family-core/repositories/cards.repository';
import {
  AuthorizationOutcome,
  CardAuthorizationService,
  EventSource,
  RefundOutcome,
} from './card-authorization.service';
import { IssuerEvent, ISSUER_PROVIDER } from './issuer/issuer-provider';
import type { IssuerProvider } from './issuer/issuer-provider';

export type CardEventOutcome =
  | { kind: 'authorization_request'; result: AuthorizationOutcome }
  | { kind: 'refund' | 'reversal'; result: RefundOutcome }
  | {
      kind: 'clearing';
      result: { settled: boolean; adjustmentHalalas: number };
    }
  | { kind: 'card_status'; result: { reconciled: boolean } };

/**
 * 026 (contracts/issuer-provider.md): the single entry point for issuer
 * webhooks (later) and the dev simulator (now). Every event is idempotent on
 * `(provider, issuerTxnId)`.
 */
@Injectable()
export class CardEventsService {
  private readonly logger = new Logger(CardEventsService.name);

  constructor(
    private readonly authorization: CardAuthorizationService,
    private readonly cards: CardsRepository,
    @Inject(ISSUER_PROVIDER) private readonly issuer: IssuerProvider,
  ) {}

  async handle(
    event: IssuerEvent,
    source: EventSource,
  ): Promise<CardEventOutcome> {
    switch (event.kind) {
      case 'authorization_request':
        return {
          kind: event.kind,
          result: await this.authorization.authorize(event, source),
        };
      case 'refund':
        return {
          kind: event.kind,
          result: await this.authorization.refund(event, source),
        };
      case 'reversal':
        return {
          kind: event.kind,
          result: await this.authorization.reverse(event, source),
        };
      case 'clearing':
        return {
          kind: event.kind,
          result: await this.authorization.settle(event, source),
        };
      case 'card_status':
        return {
          kind: event.kind,
          result: await this.reconcileCardStatus(event),
        };
    }
  }

  /**
   * Our database is the source of truth for decisions. If the issuer froze
   * or terminated a card on its side, mirror that so the two cannot drift.
   */
  private async reconcileCardStatus(
    event: Extract<IssuerEvent, { kind: 'card_status' }>,
  ): Promise<{ reconciled: boolean }> {
    const card = await this.cards.findByRef(this.issuer.name, event.cardRef);
    if (!card) return { reconciled: false };
    const target =
      event.status === 'terminated'
        ? 'inactive'
        : event.status === 'frozen'
          ? 'paused'
          : null;
    if (!target || card.status === target || card.status === 'inactive') {
      this.logger.log(
        `card_status ${event.status} for ${event.cardRef}: nothing to change`,
      );
      return { reconciled: false };
    }
    await this.cards.setStatus(
      card._id,
      ['active', 'paused'],
      target,
      undefined,
    );
    this.logger.warn(
      `card ${event.cardRef} set to ${target} after issuer status ${event.status}`,
    );
    return { reconciled: true };
  }
}
