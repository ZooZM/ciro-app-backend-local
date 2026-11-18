import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Wallet,
  WalletCurrency,
  WalletDocument,
} from './schemas/wallet.schema';

@Injectable()
export class WalletsRepository {
  constructor(
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<WalletDocument>,
  ) {}
  // TODO: to be implemented based on business requirements
}
