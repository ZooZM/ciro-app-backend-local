import { Types } from 'mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import {
  WalletCurrency,
  WalletReservationStatus,
} from '../wallets/schemas/wallet.schema';
import {
  InsufficientWalletBalanceException,
  WalletsService,
} from '../wallets/wallets.service';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { CiroFuelPaymentsService } from './ciro-fuel-payments.service';
import { CIRO_FUEL_TRANSFER_PROVIDER } from './payment-transfer.provider';

describe('CiroFuelPaymentsService', () => {
  let service: CiroFuelPaymentsService;
  const transactionId = 'c0a80123-4567-489a-9abc-123456789012';
  const ownerId = '507f1f77bcf86cd799439011';
  const transaction = {
    _id: transactionId,
    amountPaid: 12.34,
    owner: new Types.ObjectId(ownerId),
  };
  const repository = {
    claimForPayment: jest.fn(),
    markTransferSucceeded: jest.fn(),
    markPaymentCompleted: jest.fn(),
    markPaymentFailed: jest.fn(),
    returnPaymentToPending: jest.fn(),
  };
  const walletsService = {
    reservePayment: jest.fn(),
    settlePayment: jest.fn(),
    releasePayment: jest.fn(),
  };
  const transferProvider = { transfer: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.claimForPayment.mockResolvedValue(transaction);
    repository.markTransferSucceeded.mockResolvedValue(transaction);
    repository.markPaymentCompleted.mockResolvedValue(transaction);
    repository.markPaymentFailed.mockResolvedValue(transaction);
    repository.returnPaymentToPending.mockResolvedValue(transaction);
    walletsService.reservePayment.mockResolvedValue(
      WalletReservationStatus.RESERVED,
    );
    walletsService.settlePayment.mockResolvedValue({});
    walletsService.releasePayment.mockResolvedValue({});
    transferProvider.transfer.mockResolvedValue({
      providerReference: `mock-${transactionId}`,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CiroFuelPaymentsService,
        {
          provide: CiroFuelTransactionsRepository,
          useValue: repository,
        },
        { provide: WalletsService, useValue: walletsService },
        {
          provide: CIRO_FUEL_TRANSFER_PROVIDER,
          useValue: transferProvider,
        },
      ],
    }).compile();

    service = module.get<CiroFuelPaymentsService>(CiroFuelPaymentsService);
  });

  it('reserves, transfers, settles, then completes the pending transaction', async () => {
    await service.processPendingTransaction(transactionId);

    expect(walletsService.reservePayment).toHaveBeenCalledWith(
      ownerId,
      transactionId,
      1234,
    );
    expect(transferProvider.transfer).toHaveBeenCalledWith({
      sourceCardReference: 'bank_card1',
      destinationCardReference: 'bank_card2',
      amountMinor: 1234,
      currency: WalletCurrency.SAR,
      idempotencyKey: transactionId,
    });
    expect(repository.markTransferSucceeded).toHaveBeenCalledWith(
      transactionId,
      `mock-${transactionId}`,
    );
    expect(walletsService.settlePayment).toHaveBeenCalledWith(
      ownerId,
      transactionId,
      1234,
    );
    expect(repository.markPaymentCompleted).toHaveBeenCalledWith(transactionId);
  });

  it('marks insufficient-wallet transactions failed without transferring', async () => {
    walletsService.reservePayment.mockRejectedValue(
      new InsufficientWalletBalanceException(),
    );

    await expect(
      service.processPendingTransaction(transactionId),
    ).resolves.toBeUndefined();

    expect(repository.markPaymentFailed).toHaveBeenCalledWith(transactionId);
    expect(transferProvider.transfer).not.toHaveBeenCalled();
  });

  it('releases reserved funds and allows queue retry after transfer failure', async () => {
    const transferError = new Error('Mock transfer failed');
    transferProvider.transfer.mockRejectedValue(transferError);

    await expect(service.processPendingTransaction(transactionId)).rejects.toBe(
      transferError,
    );

    expect(walletsService.releasePayment).toHaveBeenCalledWith(
      ownerId,
      transactionId,
      1234,
    );
    expect(repository.returnPaymentToPending).toHaveBeenCalledWith(
      transactionId,
    );
    expect(walletsService.settlePayment).not.toHaveBeenCalled();
  });

  it('does not repeat a transfer after its success was recorded', async () => {
    repository.claimForPayment.mockResolvedValue({
      ...transaction,
      transferSucceededAt: new Date(),
    });

    await service.processPendingTransaction(transactionId);

    expect(transferProvider.transfer).not.toHaveBeenCalled();
    expect(walletsService.settlePayment).toHaveBeenCalledWith(
      ownerId,
      transactionId,
      1234,
    );
    expect(repository.markPaymentCompleted).toHaveBeenCalledWith(transactionId);
  });

  it('does nothing when another worker owns the transaction', async () => {
    repository.claimForPayment.mockResolvedValue(null);

    await service.processPendingTransaction(transactionId);

    expect(walletsService.reservePayment).not.toHaveBeenCalled();
    expect(transferProvider.transfer).not.toHaveBeenCalled();
  });
});
