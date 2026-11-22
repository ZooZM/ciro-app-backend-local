import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import type { CiroFuelTransactionDocument } from './schemas/ciro-fuel-transaction.schema';
import { TransactionsService } from '../../transactions/transactions.service';
import { TransactionType } from '../../transactions/enum/transaction-type.enum';
import {
  CIRO_FUEL_PAYMENT_JOB,
  CIRO_FUEL_PAYMENT_QUEUE,
  paymentJobOptions,
} from './ciro-fuel-payment.constants';

@Injectable()
export class CiroFuelTransactionsService {
  constructor(
    private readonly ciroFuelTransactionsRepository: CiroFuelTransactionsRepository,
    private readonly transactionsService: TransactionsService,
    @InjectQueue(CIRO_FUEL_PAYMENT_QUEUE) private readonly paymentQueue: Queue,
  ) {}

  /**
   * Persists the fuel and general transaction records, then queues payment for
   * background processing; the caller does not wait for payment to finish.
   */
  async create(createCiroFuelTransactionDto: CreateCiroFuelTransactionDto) {
    const newFuelTransaction = await this.ciroFuelTransactionsRepository.create(
      createCiroFuelTransactionDto,
    );

    const newTransaction = await this.transactionsService.create({
      type: TransactionType.CIRO_FUEL,
      transaction: newFuelTransaction._id,
    });

    await this.paymentQueue.add(
      CIRO_FUEL_PAYMENT_JOB,
      { transactionId: newFuelTransaction._id },
      paymentJobOptions(newFuelTransaction._id),
    );

    return newTransaction;
  }

  async findById(id: string): Promise<CiroFuelTransactionDocument> {
    const transaction = await this.ciroFuelTransactionsRepository.findById(id);

    if (!transaction) {
      throw new NotFoundException('Fuel transaction not found');
    }

    return transaction;
  }

  findAllByOwnerId(ownerId: string): Promise<CiroFuelTransactionDocument[]> {
    return this.ciroFuelTransactionsRepository.findAllByOwnerId(ownerId);
  }
}
