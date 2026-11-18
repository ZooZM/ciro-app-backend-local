import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';
import { CiroFuelTransactionsRepository } from './ciro-fuel-transactions.repository';
import { CiroFuelTransactionDocument } from './schemas/ciro-fuel-transaction.schema';

@Injectable()
export class CiroFuelTransactionsService {
  constructor(
    private readonly ciroFuelTransactionsRepository: CiroFuelTransactionsRepository,
  ) {}

  create(
    createCiroFuelTransactionDto: CreateCiroFuelTransactionDto,
  ): Promise<CiroFuelTransactionDocument> {
    return this.ciroFuelTransactionsRepository.create(
      createCiroFuelTransactionDto,
    );
  }

  async findById(id: string): Promise<CiroFuelTransactionDocument> {
    const transaction = await this.ciroFuelTransactionsRepository.findById(id);

    if (!transaction) {
      throw new NotFoundException('Fuel transaction not found');
    }

    return transaction;
  }

  findAllByOwnerId(
    ownerId: string,
  ): Promise<CiroFuelTransactionDocument[]> {
    return this.ciroFuelTransactionsRepository.findAllByOwnerId(ownerId);
  }
}
