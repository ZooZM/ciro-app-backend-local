import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  WalletCurrency,
  WalletDocument,
  WalletReservationStatus,
} from './schemas/wallet.schema';
import { WalletsRepository } from './wallets.repository';
import {
  InsufficientWalletBalanceException,
  WalletsService,
} from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;
  let walletsRepository: {
    findOrCreateByOwnerId: jest.Mock;
    findByOwnerId: jest.Mock;
    credit: jest.Mock;
    debit: jest.Mock;
    reservePayment: jest.Mock;
    settlePayment: jest.Mock;
    releasePayment: jest.Mock;
  };

  const ownerId = '507f1f77bcf86cd799439011';
  const wallet = {
    ownerId: new Types.ObjectId(ownerId),
    balance: 500,
    currency: WalletCurrency.SAR,
  } as WalletDocument;

  beforeEach(async () => {
    walletsRepository = {
      findOrCreateByOwnerId: jest.fn(),
      findByOwnerId: jest.fn(),
      credit: jest.fn(),
      debit: jest.fn(),
      reservePayment: jest.fn(),
      settlePayment: jest.fn(),
      releasePayment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: WalletsRepository, useValue: walletsRepository },
      ],
    }).compile();

    service = module.get<WalletsService>(WalletsService);
  });

  it('creates or returns the current owner wallet on lookup', async () => {
    walletsRepository.findOrCreateByOwnerId.mockResolvedValue(wallet);

    await expect(service.getMyWallet(ownerId)).resolves.toBe(wallet);
    expect(walletsRepository.findOrCreateByOwnerId).toHaveBeenCalledWith(
      ownerId,
    );
  });

  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])(
    'rejects invalid amount %s',
    async (amountMinor) => {
      await expect(service.credit(ownerId, amountMinor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.debit(ownerId, amountMinor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(walletsRepository.credit).not.toHaveBeenCalled();
      expect(walletsRepository.debit).not.toHaveBeenCalled();
    },
  );

  it('rejects a credit that exceeds the safe balance limit', async () => {
    walletsRepository.credit.mockResolvedValue(null);
    walletsRepository.findByOwnerId.mockResolvedValue(wallet);

    await expect(service.credit(ownerId, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('distinguishes insufficient funds from a missing wallet', async () => {
    walletsRepository.debit.mockResolvedValue(null);
    walletsRepository.findByOwnerId.mockResolvedValue(wallet);

    await expect(service.debit(ownerId, 600)).rejects.toBeInstanceOf(
      ConflictException,
    );

    walletsRepository.findByOwnerId.mockResolvedValue(null);
    await expect(service.debit(ownerId, 600)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns updated wallet after a successful debit', async () => {
    walletsRepository.debit.mockResolvedValue(wallet);

    await expect(service.debit(ownerId, 100)).resolves.toBe(wallet);
    expect(walletsRepository.findByOwnerId).not.toHaveBeenCalled();
  });

  it('reserves an amount for a payment using the transaction id', async () => {
    walletsRepository.findOrCreateByOwnerId.mockResolvedValue(wallet);
    walletsRepository.reservePayment.mockResolvedValue({
      wallet,
      status: WalletReservationStatus.RESERVED,
    });

    await expect(
      service.reservePayment(ownerId, 'payment-1', 100),
    ).resolves.toBe(WalletReservationStatus.RESERVED);
    expect(walletsRepository.reservePayment).toHaveBeenCalledWith(
      ownerId,
      'payment-1',
      100,
    );
  });

  it('rejects a reservation when available funds are insufficient', async () => {
    walletsRepository.findOrCreateByOwnerId.mockResolvedValue(wallet);
    walletsRepository.reservePayment.mockResolvedValue(null);

    await expect(
      service.reservePayment(ownerId, 'payment-1', 600),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceException);
  });

  it('settles and releases payment reservations', async () => {
    walletsRepository.settlePayment.mockResolvedValue(wallet);
    walletsRepository.releasePayment.mockResolvedValue(wallet);

    await expect(
      service.settlePayment(ownerId, 'payment-1', 100),
    ).resolves.toBe(wallet);
    await expect(
      service.releasePayment(ownerId, 'payment-2', 100),
    ).resolves.toBe(wallet);
  });
});
