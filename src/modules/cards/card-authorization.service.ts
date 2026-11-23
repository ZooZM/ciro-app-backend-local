import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { riyadhDate } from '../../common/utils/riyadh-time.util';
import { UsersService } from '../users/users.service';
import { LedgerHealthService } from '../wallet/ledger-health.service';
import { WalletService } from '../wallet/wallet.service';
import { EntryType } from '../wallet/schemas/ledger-entry.schema';
import {
  InsufficientBalanceError,
  isDuplicateKeyError,
} from '../wallet/ledger.errors';
import { CardsRepository } from '../family-core/repositories/cards.repository';
import { FamilyLinksRepository } from '../family-core/repositories/family-links.repository';
import { AllowanceSettingsRepository } from '../family-core/repositories/allowance-settings.repository';
import { DailyLimitBoostsRepository } from '../family-core/repositories/daily-limit-boosts.repository';
import { CardTransactionsRepository } from '../family-core/repositories/card-transactions.repository';
import {
  SpendCounterService,
  RESERVE_MISS,
  RESERVE_OVER_LIMIT,
} from '../family-core/spend-counter.service';
import { AllowanceEventsService } from '../family-core/allowance-events.service';
import { CardTransactionDocument } from '../family-core/schemas/card-transaction.schema';
import { CardDocument } from '../family-core/schemas/card.schema';
import { FamilyLinkDocument } from '../family-core/schemas/family-link.schema';
import { fromCardTransaction } from '../family-core/activity-mapper';
import { effectiveDailyLimit } from '../family-core/allowance-math';
import { DeclineReason } from '../family-core/family-core.constants';
import { refundExceedsRemaining } from '../family-core/allowance-errors';
import { decideAuthorization } from './authorization/decide-authorization';
import {
  AuthorizationRequestEvent,
  IssuerEvent,
  ISSUER_PROVIDER,
} from './issuer/issuer-provider';
import type { IssuerProvider } from './issuer/issuer-provider';

export type EventSource = 'issuer' | 'simulation';

export interface AuthorizationOutcome {
  transactionId: string;
  outcome: 'approved' | 'declined';
  declineReason?: DeclineReason;
  /** True when this issuer transaction id had already been handled. */
  duplicate?: boolean;
}

export interface RefundOutcome {
  transactionId: string;
  creditedTo: 'child' | 'former_parent';
  duplicate?: boolean;
}

/** Raised inside the transaction when the guarded debit fails, so the transaction aborts. */
class InsufficientBalance extends Error {}

/**
 * 026 (research R3, contracts/issuer-provider.md): the purchase path.
 *
 *  1. snapshot  2. pure decision  3. Redis reservation (Lua)
 *  4. one Mongo transaction: card_transactions row + `purchase` ledger entry + rev bump
 *  5. after commit: socket events and pushes
 *
 * It fails closed: any timeout (1,500 ms budget) or infrastructure error is
 * recorded as a decline with `SERVICE_UNAVAILABLE` and moves no money.
 */
@Injectable()
export class CardAuthorizationService {
  private readonly logger = new Logger(CardAuthorizationService.name);

  /** Hard budget inside the issuer's ~2 s window (plan Performance Goals). */
  budgetMs = 1500;

  constructor(
    private readonly cards: CardsRepository,
    private readonly links: FamilyLinksRepository,
    private readonly settings: AllowanceSettingsRepository,
    private readonly boosts: DailyLimitBoostsRepository,
    private readonly cardTransactions: CardTransactionsRepository,
    private readonly spendCounter: SpendCounterService,
    private readonly wallet: WalletService,
    private readonly health: LedgerHealthService,
    private readonly events: AllowanceEventsService,
    @Inject(ISSUER_PROVIDER) private readonly issuer: IssuerProvider,
    private readonly users: UsersService,
  ) {}

  // ───────────────────────────── authorize ─────────────────────────────

  async authorize(
    event: AuthorizationRequestEvent,
    source: EventSource,
  ): Promise<AuthorizationOutcome> {
    const started = Date.now();
    const provider = this.issuer.name;

    const existing = await this.cardTransactions.findByIssuerTxn(
      provider,
      event.issuerTxnId,
    );
    if (existing) return this.outcomeOf(existing, true);

    const card = await this.cards.findByRef(provider, event.cardRef);
    if (!card) throw new NotFoundException('Unknown card');

    if (!this.health.ledgerAvailable) {
      return this.recordUnavailable(card, event, source, started);
    }

    const txnId = new Types.ObjectId();
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const inner = this.runAuthorization(
      card,
      event,
      source,
      txnId,
      started,
      () => timedOut,
    );
    const budget = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.budgetMs);
    });

    try {
      const winner = await Promise.race([inner, budget]);
      if (winner !== 'timeout') return winner;
      timedOut = true;
      // The inner flow may still be running. Its transaction inserts the same
      // (provider, issuerTxnId); whichever insert wins decides the outcome.
      inner.catch(() => undefined);
      return await this.recordUnavailable(card, event, source, started);
    } catch (err) {
      this.logger.error(
        `authorize ${event.issuerTxnId} failed: ${(err as Error).message}`,
      );
      return this.recordUnavailable(card, event, source, started);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async runAuthorization(
    card: CardDocument,
    event: AuthorizationRequestEvent,
    source: EventSource,
    txnId: Types.ObjectId,
    started: number,
    isTimedOut: () => boolean,
  ): Promise<AuthorizationOutcome> {
    const provider = this.issuer.name;
    const today = riyadhDate(event.occurredAt ?? new Date());
    const childId = card.childUserId.toString();

    // 1. snapshot
    const link = await this.links.findById(card.linkId);
    const settings = link ? await this.settings.findByLinkId(link._id) : null;
    if (!link || !settings) throw new Error('Card has no link or settings');
    const [boost, balance] = await Promise.all([
      this.boosts.amountFor(card.childUserId, today),
      this.wallet.getBalance(link.childAccountId),
    ]);
    const effective = effectiveDailyLimit(settings.dailyLimitHalalas, boost);
    const spent = await this.spendCounter.get(childId, today);

    // 2. pure decision
    const decision = decideAuthorization({
      cardStatus: card.status,
      category: event.category,
      blockedCategories: settings.blockedCategories,
      amountHalalas: event.amountHalalas,
      perPurchaseMaxHalalas: settings.perPurchaseMaxHalalas,
      effectiveDailyLimitHalalas: effective,
      spentTodayHalalas: spent,
      balanceHalalas: balance,
    });
    if (!decision.approved) {
      return this.recordDecline(
        card,
        link,
        event,
        source,
        decision.reason,
        txnId,
        started,
      );
    }

    // 3. Redis reservation: atomic against concurrent purchases
    let reserved = await this.spendCounter.reserve(
      childId,
      today,
      event.amountHalalas,
      effective,
    );
    if (reserved === RESERVE_MISS) {
      await this.spendCounter.rebuild(childId, today);
      reserved = await this.spendCounter.reserve(
        childId,
        today,
        event.amountHalalas,
        effective,
      );
    }
    if (reserved === RESERVE_OVER_LIMIT) {
      return this.recordDecline(
        card,
        link,
        event,
        source,
        DeclineReason.OVER_DAILY_LIMIT,
        txnId,
        started,
      );
    }
    if (reserved === RESERVE_MISS) throw new Error('Spend counter unavailable');

    const release = () =>
      this.spendCounter
        .release(childId, today, event.amountHalalas, txnId.toString())
        .catch((e: Error) =>
          this.logger.error(
            `counter release failed for ${txnId.toString()}: ${e.message}`,
          ),
        );

    // 4. one transaction
    let result: { tx: CardTransactionDocument; entryId: Types.ObjectId };
    try {
      if (isTimedOut()) {
        await release();
        throw new Error('budget exceeded before commit');
      }
      result = await this.wallet.runInTransaction(async (session) => {
        if (isTimedOut()) throw new Error('budget exceeded before commit');
        const settlement =
          await this.wallet.getSystemAccount('card_settlement');
        const tx = await this.cardTransactions.insert(
          {
            _id: txnId,
            provider,
            issuerTxnId: event.issuerTxnId,
            kind: 'authorization',
            cardId: card._id,
            childUserId: card.childUserId,
            parentUserId: link.parentUserId,
            linkId: link._id,
            merchantName: event.merchantName,
            category: event.category,
            mcc: event.mcc,
            amountHalalas: event.amountHalalas,
            outcome: 'approved',
            settlement: 'authorized',
            refundedHalalas: 0,
            riyadhDate: today,
            source,
            decisionMs: Date.now() - started,
          } as never,
          session,
        );
        let entry;
        try {
          ({ entry } = await this.wallet.transfer(
            {
              type: EntryType.PURCHASE,
              fromAccountId: link.childAccountId,
              toAccountId: settlement,
              amountHalalas: event.amountHalalas,
              idempotencyKey: `card:${provider}:${event.issuerTxnId}`,
              initiator: {
                kind: source === 'simulation' ? 'simulation' : 'system',
                userId: card.childUserId,
              },
              refs: { linkId: link._id, cardTransactionId: tx._id },
              riyadhDate: today,
            },
            session,
          ));
        } catch (err) {
          if (err instanceof InsufficientBalanceError)
            throw new InsufficientBalance();
          throw err;
        }
        await this.cardTransactions.setLedgerEntry(tx._id, entry._id, session);
        await this.links.bumpRev(link._id, session);
        return { tx, entryId: entry._id };
      });
    } catch (err) {
      await release();
      if (err instanceof InsufficientBalance) {
        return this.recordDecline(
          card,
          link,
          event,
          source,
          DeclineReason.INSUFFICIENT_BALANCE,
          txnId,
          started,
        );
      }
      if (isDuplicateKeyError(err)) {
        const first = await this.cardTransactions.findByIssuerTxn(
          provider,
          event.issuerTxnId,
        );
        if (first) return this.outcomeOf(first, true);
      }
      throw err;
    }

    // 5. after commit
    const approved = await this.cardTransactions.findById(result.tx._id);
    await this.events.summaryChanged(
      childId,
      'purchase',
      approved ? fromCardTransaction(approved) : undefined,
      link,
    );
    if (approved) await this.notifyParentOfPurchase(approved, link);
    return { transactionId: txnId.toString(), outcome: 'approved' };
  }

  // ───────────────────────────── declines ─────────────────────────────

  /** A recorded decline: no ledger entry (FR-043). */
  private async recordDecline(
    card: CardDocument,
    link: FamilyLinkDocument,
    event: AuthorizationRequestEvent,
    source: EventSource,
    reason: DeclineReason,
    txnId: Types.ObjectId,
    started: number,
  ): Promise<AuthorizationOutcome> {
    let tx: CardTransactionDocument;
    try {
      tx = await this.cardTransactions.insert({
        _id: txnId,
        provider: this.issuer.name,
        issuerTxnId: event.issuerTxnId,
        kind: 'authorization',
        cardId: card._id,
        childUserId: card.childUserId,
        parentUserId: link.parentUserId,
        linkId: link._id,
        merchantName: event.merchantName,
        category: event.category,
        mcc: event.mcc,
        amountHalalas: event.amountHalalas,
        outcome: 'declined',
        declineReason: reason,
        refundedHalalas: 0,
        riyadhDate: riyadhDate(event.occurredAt ?? new Date()),
        source,
        decisionMs: Date.now() - started,
      } as never);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const first = await this.cardTransactions.findByIssuerTxn(
          this.issuer.name,
          event.issuerTxnId,
        );
        if (first) return this.outcomeOf(first, true);
      }
      throw err;
    }
    await this.afterDecline(tx, link);
    return {
      transactionId: tx._id.toString(),
      outcome: 'declined',
      declineReason: reason,
    };
  }

  /** Fail-closed: `SERVICE_UNAVAILABLE`, recorded, no ledger entry. */
  private async recordUnavailable(
    card: CardDocument,
    event: AuthorizationRequestEvent,
    source: EventSource,
    started: number,
  ): Promise<AuthorizationOutcome> {
    const link = await this.links.findById(card.linkId).catch(() => null);
    try {
      const tx = await this.cardTransactions.insert({
        provider: this.issuer.name,
        issuerTxnId: event.issuerTxnId,
        kind: 'authorization',
        cardId: card._id,
        childUserId: card.childUserId,
        parentUserId: link?.parentUserId ?? card.childUserId,
        linkId: card.linkId,
        merchantName: event.merchantName,
        category: event.category,
        mcc: event.mcc,
        amountHalalas: event.amountHalalas,
        outcome: 'declined',
        declineReason: DeclineReason.SERVICE_UNAVAILABLE,
        refundedHalalas: 0,
        riyadhDate: riyadhDate(event.occurredAt ?? new Date()),
        source,
        decisionMs: Date.now() - started,
      } as never);
      if (link) await this.afterDecline(tx, link);
      return {
        transactionId: tx._id.toString(),
        outcome: 'declined',
        declineReason: DeclineReason.SERVICE_UNAVAILABLE,
      };
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        // The inner flow (or an earlier delivery) already recorded this transaction.
        const first = await this.cardTransactions.findByIssuerTxn(
          this.issuer.name,
          event.issuerTxnId,
        );
        if (first) return this.outcomeOf(first, true);
      }
      this.logger.error(
        `could not record SERVICE_UNAVAILABLE: ${(err as Error).message}`,
      );
      return {
        transactionId: '',
        outcome: 'declined',
        declineReason: DeclineReason.SERVICE_UNAVAILABLE,
      };
    }
  }

  /** Socket event, the child's push (US2-10), and the parent's purchase push (US7, wired in T221). */
  private async afterDecline(
    tx: CardTransactionDocument,
    link: FamilyLinkDocument,
  ): Promise<void> {
    const childId = tx.childUserId.toString();
    // A card of an unlinked child still declines, but the former family is not told.
    if (link.status !== 'active') return;
    await this.events.summaryChanged(
      childId,
      'purchase_declined',
      fromCardTransaction(tx),
      link,
    );
    await this.events.notify(
      childId,
      'allowance.purchaseDeclined',
      {
        merchant: tx.merchantName,
        amountHalalas: tx.amountHalalas,
        reason: tx.declineReason,
        childId,
      },
      { audience: 'phone', childId },
    );
    await this.notifyParentOfPurchase(tx, link);
  }

  /**
   * FR-081: the parent hears about each purchase, approved or declined, only
   * while this child's `purchaseNotifications` is on. Never fails the purchase.
   */
  private async notifyParentOfPurchase(
    tx: CardTransactionDocument,
    link: FamilyLinkDocument,
  ): Promise<void> {
    try {
      const settings = await this.settings.findByLinkId(link._id);
      if (!settings?.purchaseNotifications) return;
      const childId = tx.childUserId.toString();
      const child = await this.users.findById(childId);
      await this.events.notify(
        link.parentUserId.toString(),
        'allowance.purchase',
        {
          childName: child?.name ?? '',
          merchant: tx.merchantName,
          amountHalalas: tx.amountHalalas,
          outcome: tx.outcome,
          reason: tx.declineReason ?? null,
          childId,
        },
        { childId, data: { transactionId: tx._id.toString() } },
      );
    } catch (err) {
      this.logger.warn(
        `parent purchase notification failed: ${(err as Error).message}`,
      );
    }
  }

  private outcomeOf(
    tx: CardTransactionDocument,
    duplicate = false,
  ): AuthorizationOutcome {
    return {
      transactionId: tx._id.toString(),
      outcome: tx.outcome,
      ...(tx.declineReason ? { declineReason: tx.declineReason } : {}),
      ...(duplicate ? { duplicate } : {}),
    };
  }

  // ───────────────────────────── refund ─────────────────────────────

  /**
   * FR-044: credits the child, or the **former parent** when the link on the
   * original purchase has since been unlinked. A guarded `$inc` of
   * `refundedHalalas` (never past the original amount) runs in the same
   * transaction. A same-day refund also gives the amount back to today's
   * spent counter.
   */
  async refund(
    event: Extract<IssuerEvent, { kind: 'refund' }>,
    source: EventSource,
  ): Promise<RefundOutcome> {
    const provider = this.issuer.name;
    const dup = await this.cardTransactions.findByIssuerTxn(
      provider,
      event.issuerTxnId,
    );
    if (dup) return this.refundOutcome(dup, true);

    const original = await this.cardTransactions.findByIssuerTxn(
      provider,
      event.originalIssuerTxnId,
    );
    if (
      !original ||
      original.kind !== 'authorization' ||
      original.outcome !== 'approved'
    ) {
      throw new NotFoundException('Original purchase not found');
    }
    return this.returnMoney(
      original,
      event.issuerTxnId,
      event.amountHalalas,
      'refund',
      source,
      event.merchantName,
    );
  }

  /** Reversal of an authorization: credit back and release the same-day counter (idempotent). */
  async reverse(
    event: Extract<IssuerEvent, { kind: 'reversal' }>,
    source: EventSource,
  ): Promise<RefundOutcome> {
    const provider = this.issuer.name;
    const dup = await this.cardTransactions.findByIssuerTxn(
      provider,
      event.issuerTxnId,
    );
    if (dup) return this.refundOutcome(dup, true);

    const original = await this.cardTransactions.findByIssuerTxn(
      provider,
      event.authIssuerTxnId,
    );
    if (
      !original ||
      original.kind !== 'authorization' ||
      original.outcome !== 'approved'
    ) {
      throw new NotFoundException('Original purchase not found');
    }
    return this.returnMoney(
      original,
      event.issuerTxnId,
      event.amountHalalas,
      'reversal',
      source,
      original.merchantName,
    );
  }

  private async returnMoney(
    original: CardTransactionDocument,
    issuerTxnId: string,
    amountHalalas: number,
    kind: 'refund' | 'reversal',
    source: EventSource,
    merchantName: string,
  ): Promise<RefundOutcome> {
    const provider = this.issuer.name;
    const today = riyadhDate(new Date());
    const txnId = new Types.ObjectId();
    const link = await this.links.findById(original.linkId);
    const toFormerParent = !link || link.status !== 'active';

    let creditedTo: 'child' | 'former_parent' = 'child';
    try {
      await this.wallet.runInTransaction(async (session) => {
        const settlement =
          await this.wallet.getSystemAccount('card_settlement');
        const tx = await this.cardTransactions.insert(
          {
            _id: txnId,
            provider,
            issuerTxnId,
            kind,
            cardId: original.cardId,
            childUserId: original.childUserId,
            parentUserId: original.parentUserId,
            linkId: original.linkId,
            merchantName,
            category: original.category,
            amountHalalas,
            outcome: 'approved',
            originalTransactionId: original._id,
            refundedHalalas: 0,
            riyadhDate: today,
            source,
          } as never,
          session,
        );
        if (
          !(await this.cardTransactions.incRefunded(
            original._id,
            amountHalalas,
            session,
          ))
        ) {
          throw refundExceedsRemaining();
        }

        let to: Types.ObjectId;
        if (toFormerParent) {
          creditedTo = 'former_parent';
          to = (
            await this.wallet.getOrCreateUserWallet(
              original.parentUserId,
              session,
            )
          )._id;
        } else {
          to = link.childAccountId;
        }
        const { entry } = await this.wallet.transfer(
          {
            type:
              kind === 'refund'
                ? EntryType.REFUND
                : EntryType.PURCHASE_REVERSAL,
            fromAccountId: settlement,
            toAccountId: to,
            amountHalalas,
            idempotencyKey: `${kind === 'refund' ? 'card-refund' : 'card-rev'}:${provider}:${issuerTxnId}`,
            initiator: {
              kind: source === 'simulation' ? 'simulation' : 'system',
            },
            refs: { linkId: original.linkId, cardTransactionId: tx._id },
            riyadhDate: today,
          },
          session,
        );
        await this.cardTransactions.setLedgerEntry(tx._id, entry._id, session);
        if (kind === 'reversal') {
          await this.cardTransactions.setSettlement(
            original._id,
            'reversed',
            session,
          );
        }
        if (!toFormerParent) await this.links.bumpRev(link._id, session);
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const first = await this.cardTransactions.findByIssuerTxn(
          provider,
          issuerTxnId,
        );
        if (first) return this.refundOutcome(first, true);
      }
      throw err;
    }

    if (creditedTo === 'child') {
      if (original.riyadhDate === today) {
        await this.spendCounter.release(
          original.childUserId.toString(),
          today,
          amountHalalas,
          txnId.toString(),
        );
      }
      const stored = await this.cardTransactions.findById(txnId);
      await this.events.summaryChanged(
        original.childUserId.toString(),
        kind === 'refund' ? 'refund' : 'purchase_reversal',
        stored ? fromCardTransaction(stored) : undefined,
        link,
      );
    }
    return { transactionId: txnId.toString(), creditedTo };
  }

  private refundOutcome(
    tx: CardTransactionDocument,
    duplicate = false,
  ): RefundOutcome {
    return {
      transactionId: tx._id.toString(),
      // Replays do not know where the credit went; the key is unique so the first delivery decided.
      creditedTo: 'child',
      ...(duplicate ? { duplicate } : {}),
    };
  }

  // ───────────────────────────── clearing ─────────────────────────────

  /**
   * Clearing: the same amount marks the purchase `settled`; a different
   * amount posts one `clearing_adjustment` for the difference. Replays are
   * idempotent (the ledger key is unique).
   */
  async settle(
    event: Extract<IssuerEvent, { kind: 'clearing' }>,
    source: EventSource,
  ): Promise<{ settled: boolean; adjustmentHalalas: number }> {
    const provider = this.issuer.name;
    const original = await this.cardTransactions.findByIssuerTxn(
      provider,
      event.authIssuerTxnId,
    );
    if (
      !original ||
      original.kind !== 'authorization' ||
      original.outcome !== 'approved'
    ) {
      throw new NotFoundException('Original purchase not found');
    }
    const diff = event.amountHalalas - original.amountHalalas;
    const link = await this.links.findById(original.linkId);

    await this.wallet.runInTransaction(async (session: ClientSession) => {
      await this.cardTransactions.setSettlement(
        original._id,
        'settled',
        session,
      );
      if (diff === 0 || !link) return;
      const settlement = await this.wallet.getSystemAccount('card_settlement');
      await this.wallet.transfer(
        {
          type: EntryType.CLEARING_ADJUSTMENT,
          fromAccountId: diff > 0 ? link.childAccountId : settlement,
          toAccountId: diff > 0 ? settlement : link.childAccountId,
          amountHalalas: Math.abs(diff),
          idempotencyKey: `card-clear:${provider}:${event.issuerTxnId}`,
          initiator: {
            kind: source === 'simulation' ? 'simulation' : 'system',
          },
          refs: { linkId: original.linkId, cardTransactionId: original._id },
        },
        session,
      );
      await this.links.bumpRev(link._id, session);
    });
    return { settled: true, adjustmentHalalas: diff };
  }
}
