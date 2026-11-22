import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Transaction, TransactionDocument } from './schema/transaction.schema';
import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsRepository {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionsModel: Model<TransactionDocument>,
  ) {}

  async create(createTransactionDto: CreateTransactionDto) {
    return this.transactionsModel
      .findOneAndUpdate(
        {
          type: createTransactionDto.type,
          transaction: createTransactionDto.transaction,
        },
        { $setOnInsert: createTransactionDto },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
  }

  async findAll() {
    return this.transactionsModel.find({});
  }
}
