import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { toCents } from '../payment-verifications/utils/money.util';
import {
  WalletCurrency,
  WalletReservationStatus,
} from '../wallets/schemas/wallet.schema';
import {
  InsufficientWalletBalanceException,
  WalletsService,
} from '../wallets/wallets.service';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { CIRO_FUEL_TRANSFER_PROVIDER } from './payment-transfer.provider';
import type { CiroFuelTransferProvider } from './payment-transfer.provider';
import { CIRO_FUEL_PAYMENT_PROCESSING_LEASE_MS } from './ciro-fuel-payment.constants';

function referenceId(value: unknown): string {
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (
    value &&
    typeof value === 'object' &&
    '_id' in value &&
    value._id instanceof Types.ObjectId
  ) {
    return value._id.toHexString();
  }
  throw new TypeError('Expected a user ObjectId reference');
}

@Injectable()
export class CiroFuelPaymentsService {
  private readonly logger = new Logger(CiroFuelPaymentsService.name);

  constructor(
    private readonly ciroFuelransactionsRepository: CiroFuelTransactionsRepository,
    private readonly walletsService: WalletsService,
    @Inject(CIRO_FUEL_TRANSFER_PROVIDER)
    private readonly transferProvider: CiroFuelTransferProvider,
  ) {}

  /**
   * Claims an eligible transaction, reserves the owner's funds, and performs
   * the transfer before settling the reservation. Failures are either marked
   * terminal or returned to pending so the queue can retry safely.
   */
  async processPendingTransaction(transactionId: string): Promise<void> {
    const transaction = await this.ciroFuelransactionsRepository.claimForPayment(
      transactionId,
      new Date(Date.now() - CIRO_FUEL_PAYMENT_PROCESSING_LEASE_MS),
    );
    // Duplicate jobs are expected; only an eligible transaction is processed.
    if (!transaction) return;

    // Wallets and the transfer provider use integer minor currency units.
    const amountMinor = toCents(transaction.amountPaid);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      await this.ciroFuelransactionsRepository.markPaymentFailed(transactionId);
      this.logger.error(
        `Transaction ${transactionId} has an invalid payment amount`,
      );
      return;
    }

    // The wallet is charged to the car owner, who can differ from the driver.
    const ownerId = referenceId(transaction.owner);
    let reservationStatus: WalletReservationStatus;
    try {
      reservationStatus = await this.walletsService.reservePayment(
        ownerId,
        transactionId,
        amountMinor,
      );
    } catch (error) {
      if (error instanceof InsufficientWalletBalanceException) {
        // Insufficient funds is a terminal business outcome, not a retryable error.
        await this.ciroFuelransactionsRepository.markPaymentFailed(transactionId);
        return;
      }
      // Let BullMQ retry unexpected failures after making the transaction claimable.
      await this.ciroFuelransactionsRepository.returnPaymentToPending(transactionId);
      throw error;
    }

    // A prior attempt may have completed the debit before recording completion.
    if (reservationStatus === WalletReservationStatus.SETTLED) {
      await this.markCompleted(transactionId);
      return;
    }

    // A recorded success lets retries continue to wallet settlement without
    // repeating the external transfer; the transaction ID is also its
    // provider idempotency key for retries before that success is recorded.
    if (!transaction.transferSucceededAt) {
      try {
        const transfer = await this.transferProvider.transfer({
          sourceCardReference: 'bank_card1',
          destinationCardReference: 'bank_card2',
          amountMinor,
          currency: WalletCurrency.SAR,
          idempotencyKey: transactionId,
        });
        // Persist transfer success before settlement so a later retry can skip
        // the transfer and finish settling the already-reserved funds.
        const marked = await this.ciroFuelransactionsRepository.markTransferSucceeded(
          transactionId,
          transfer.providerReference,
        );
        if (!marked) {
          throw new ConflictException(
            'Transaction changed while recording transfer success',
          );
        }
      } catch (error) {
        await this.walletsService.releasePayment(
          ownerId,
          transactionId,
          amountMinor,
        );
        await this.ciroFuelransactionsRepository.returnPaymentToPending(transactionId);
        throw error;
      }
    }

    await this.walletsService.settlePayment(
      ownerId,
      transactionId,
      amountMinor,
    );
    await this.markCompleted(transactionId);
  }

  private async markCompleted(transactionId: string): Promise<void> {
    const completed =
      await this.ciroFuelransactionsRepository.markPaymentCompleted(transactionId);
    if (!completed) {
      throw new ConflictException(
        'Transaction changed while recording payment completion',
      );
    }
  }
}
