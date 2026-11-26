import type {
  DeclineReason,
  SpendingCategory,
} from '../../family-core/family-core.constants';

/** 026 contracts/issuer-provider.md. */
export const ISSUER_PROVIDER = Symbol('ISSUER_PROVIDER');

export type IssuerName = 'stub' | 'nymcard';

export interface IssuedCard {
  /** Provider's card id; unique per provider. */
  cardRef: string;
  last4: string;
}

/** Normalized inbound events. Amounts are integer halalas; currency is always SAR here. */
export type IssuerEvent =
  | {
      kind: 'authorization_request';
      issuerTxnId: string;
      cardRef: string;
      amountHalalas: number;
      merchantName: string;
      category?: SpendingCategory;
      mcc?: string;
      occurredAt: Date;
    }
  | {
      kind: 'clearing';
      issuerTxnId: string;
      authIssuerTxnId: string;
      amountHalalas: number;
      occurredAt: Date;
    }
  | {
      kind: 'reversal';
      issuerTxnId: string;
      authIssuerTxnId: string;
      amountHalalas: number;
      occurredAt: Date;
    }
  | {
      kind: 'refund';
      issuerTxnId: string;
      cardRef: string;
      originalIssuerTxnId: string;
      amountHalalas: number;
      merchantName: string;
      occurredAt: Date;
    }
  | {
      kind: 'card_status';
      cardRef: string;
      status: 'active' | 'frozen' | 'terminated';
      occurredAt: Date;
    };

export type AuthorizationRequestEvent = Extract<
  IssuerEvent,
  { kind: 'authorization_request' }
>;

export interface AuthorizationDecisionResult {
  approved: boolean;
  declineReason?: DeclineReason;
  /** Our `card_transactions._id`. */
  transactionId: string;
}

export interface IssuerProvider {
  readonly name: IssuerName;

  /** Outbound card management. Called after commit; retried through BullMQ `card-sync`. */
  issueCard(input: {
    childUserId: string;
    displayName: string;
  }): Promise<IssuedCard>;
  freezeCard(cardRef: string): Promise<void>;
  unfreezeCard(cardRef: string): Promise<void>;
  terminateCard(cardRef: string): Promise<void>;

  /** Inbound. MUST verify the signature (UnauthorizedException on mismatch) and MUST NOT touch the DB. */
  parseWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): IssuerEvent;

  /** Provider-specific synchronous reply body for an authorization_request webhook. */
  formatAuthorizationResponse(
    result: AuthorizationDecisionResult,
    event: AuthorizationRequestEvent,
  ): unknown;
}
