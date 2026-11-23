import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * 026 contracts/rest-api.md "Error code catalogue". Clients switch on
 * `error`; `message` is for logs only (constitution VII: the app never shows
 * it). `data` (when present) is forwarded into the error envelope.
 */
type Data = Record<string, unknown>;

const body = (error: string, message: string, data?: Data) =>
  data === undefined ? { error, message } : { error, message, data };

export const ledgerUnavailable = () =>
  new ServiceUnavailableException(
    body('LEDGER_UNAVAILABLE', 'Money features are temporarily unavailable'),
  );
export const childNotFound = () =>
  new NotFoundException(body('CHILD_NOT_FOUND', 'Child not found'));
export const notALinkedChild = () =>
  new NotFoundException(body('NOT_A_LINKED_CHILD', 'Not a linked child'));
export const linkCodeInvalidOrExpired = () =>
  new NotFoundException(
    body('LINK_CODE_INVALID_OR_EXPIRED', 'Link code is invalid or expired'),
  );
export const linkCodeAlreadyUsed = () =>
  new ConflictException(
    body('LINK_CODE_ALREADY_USED', 'Link code already used'),
  );
export const linkCodeNotClaimed = () =>
  new ConflictException(
    body('LINK_CODE_NOT_CLAIMED', 'No child has claimed this code yet'),
  );
export const cannotLinkSelf = () =>
  new ConflictException(
    body('CANNOT_LINK_SELF', 'You cannot link to yourself'),
  );
export const childAlreadyLinked = () =>
  new ConflictException(
    body('CHILD_ALREADY_LINKED', 'This account is already linked to a parent'),
  );
export const accountIsParent = () =>
  new ConflictException(
    body('ACCOUNT_IS_PARENT', 'This account already has linked children'),
  );
export const accountIsChild = () =>
  new ConflictException(
    body('ACCOUNT_IS_CHILD', 'A linked child cannot add children'),
  );
export const maxChildrenReached = () =>
  new ConflictException(
    body('MAX_CHILDREN_REACHED', 'A parent can link at most 10 children'),
  );
export const perPurchaseAboveDailyLimit = () =>
  new BadRequestException(
    body(
      'PER_PURCHASE_ABOVE_DAILY_LIMIT',
      'Per-purchase maximum cannot be above the daily limit',
    ),
  );
export const insufficientFunds = () =>
  new ConflictException(
    body('INSUFFICIENT_FUNDS', 'Not enough money in the parent wallet'),
  );
export const amountExceedsChildBalance = () =>
  new ConflictException(
    body(
      'AMOUNT_EXCEEDS_CHILD_BALANCE',
      'Amount is more than the child balance',
    ),
  );
export const payoutNotPayable = () =>
  new ConflictException(
    body('PAYOUT_NOT_PAYABLE', 'This payout can no longer be paid'),
  );
export const cardInactive = () =>
  new ConflictException(body('CARD_INACTIVE', 'The card is inactive'));
export const requestAlreadyPending = (pending: unknown) =>
  new ConflictException(
    body('REQUEST_ALREADY_PENDING', 'A request is already pending', {
      pending,
    }),
  );
export const requestAlreadyResolved = (request: unknown) =>
  new ConflictException(
    body('REQUEST_ALREADY_RESOLVED', 'This request was already answered', {
      request,
    }),
  );
export const approvedAmountInvalid = () =>
  new BadRequestException(
    body(
      'APPROVED_AMOUNT_INVALID',
      'Approved amount must be the full amount or between 0 and it',
    ),
  );
export const refundExceedsRemaining = () =>
  new ConflictException(
    body(
      'REFUND_EXCEEDS_REMAINING',
      'Refund is more than what is left to refund',
    ),
  );
export const idempotencyKeyRequired = () =>
  new BadRequestException(
    body('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'),
  );
export const watchRequiresLinkedChild = () =>
  new ForbiddenException(
    body('WATCH_REQUIRES_LINKED_CHILD', 'Only a linked child can pair a watch'),
  );
