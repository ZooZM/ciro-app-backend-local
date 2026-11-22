import { Injectable } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsRepository } from './transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
  ) {}
  create(createTransactionDto: CreateTransactionDto) {
    return this.transactionsRepository.create(createTransactionDto);
  }

  findAll() {
    return this.transactionsRepository.findAll();
  }
}
