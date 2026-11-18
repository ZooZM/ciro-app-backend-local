import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCiroFuelTransactionDto } from './dto/create-ciro-fuel-transaction.dto';
import {
  CiroFuelTransaction,
  CiroFuelTransactionDocument,
} from './schemas/ciro-fuel-transaction.schema';

@Injectable()
export class CiroFuelTransactionsRepository {
  constructor(
    @InjectModel(CiroFuelTransaction.name)
    private readonly ciroFuelTransactionsModel: Model<CiroFuelTransactionDocument>,
  ) {}

  create(
    createCiroFuelTransactionDto: CreateCiroFuelTransactionDto,
  ): Promise<CiroFuelTransactionDocument> {
    const { station, car, driver, owner, paymentVerification, ...rest } =
      createCiroFuelTransactionDto;
    return this.ciroFuelTransactionsModel.create({
      station: new Types.ObjectId(station),
      car: new Types.ObjectId(car),
      driver: new Types.ObjectId(driver),
      owner: new Types.ObjectId(owner),
      paymentVerification: new Types.ObjectId(paymentVerification),
      ...rest,
    });
  }

  findById(id: string): Promise<CiroFuelTransactionDocument | null> {
    return this.ciroFuelTransactionsModel.findById(id).exec();
  }

  findAllByOwnerId(ownerId: string): Promise<CiroFuelTransactionDocument[]> {
    return this.ciroFuelTransactionsModel.find({ owner: ownerId }).exec();
  }
}
