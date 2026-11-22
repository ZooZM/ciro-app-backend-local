import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  WalletDocument,
  WalletReservationStatus,
} from './schemas/wallet.schema';
import { WalletsRepository } from './wallets.repository';

export class InsufficientWalletBalanceException extends ConflictException {
  constructor() {
    super('Insufficient wallet balance');
  }
}

@Injectable()
export class WalletsService {
  constructor(private readonly walletsRepository: WalletsRepository) {}

  getMyWallet(ownerId: string): Promise<WalletDocument> {
    this.validateOwnerId(ownerId);
    return this.walletsRepository.findOrCreateByOwnerId(ownerId);
  }

  async credit(ownerId: string, amount: number): Promise<WalletDocument> {
    this.validateOwnerId(ownerId);
    this.validateAmount(amount);
    const wallet = await this.walletsRepository.credit(ownerId, amount);
    if (!wallet) {
      if (!(await this.walletsRepository.findByOwnerId(ownerId))) {
        throw new NotFoundException('Wallet not found');
      }
      throw new ConflictException('Wallet balance limit would be exceeded');
    }
    return wallet;
  }

  async debit(ownerId: string, amount: number): Promise<WalletDocument> {
    this.validateOwnerId(ownerId);
    this.validateAmount(amount);
    const wallet = await this.walletsRepository.debit(ownerId, amount);
    if (wallet) return wallet;

    if (!(await this.walletsRepository.findByOwnerId(ownerId))) {
      throw new NotFoundException('Wallet not found');
    }
    throw new InsufficientWalletBalanceException();
  }

  async reservePayment(
    ownerId: string,
    transactionId: string,
    amount: number,
  ): Promise<WalletReservationStatus> {
    this.validateOwnerId(ownerId);
    this.validateAmount(amount);
    if (!transactionId.trim()) {
      throw new BadRequestException('Transaction id is required');
    }

    await this.walletsRepository.findOrCreateByOwnerId(ownerId);
    const reservation = await this.walletsRepository.reservePayment(
      ownerId,
      transactionId,
      amount,
    );
    if (
      !reservation ||
      reservation.status === WalletReservationStatus.RELEASED
    ) {
      throw new InsufficientWalletBalanceException();
    }
    return reservation.status;
  }

  async settlePayment(
    ownerId: string,
    transactionId: string,
    amount: number,
  ): Promise<WalletDocument> {
    this.validateOwnerId(ownerId);
    this.validateAmount(amount);
    const wallet = await this.walletsRepository.settlePayment(
      ownerId,
      transactionId,
      amount,
    );
    if (wallet) return wallet;

    if (!(await this.walletsRepository.findByOwnerId(ownerId))) {
      throw new NotFoundException('Wallet not found');
    }
    throw new ConflictException('Active wallet reservation not found');
  }

  async releasePayment(
    ownerId: string,
    transactionId: string,
    amount: number,
  ): Promise<WalletDocument> {
    this.validateOwnerId(ownerId);
    this.validateAmount(amount);
    const wallet = await this.walletsRepository.releasePayment(
      ownerId,
      transactionId,
      amount,
    );
    if (wallet) return wallet;

    if (!(await this.walletsRepository.findByOwnerId(ownerId))) {
      throw new NotFoundException('Wallet not found');
    }
    throw new ConflictException('Active wallet reservation not found');
  }

  private validateOwnerId(ownerId: string): void {
    if (!Types.ObjectId.isValid(ownerId)) {
      throw new BadRequestException('Invalid owner id');
    }
  }

  private validateAmount(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'Amount must be a positive safe integer in minor currency units',
      );
    }
  }
}
