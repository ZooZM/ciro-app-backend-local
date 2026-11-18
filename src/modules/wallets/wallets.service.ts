import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WalletDocument } from './schemas/wallet.schema';
import { WalletsRepository } from './wallets.repository';

@Injectable()
export class WalletsService {
  constructor(private readonly walletsRepository: WalletsRepository) {}

  // TODO: to be implemented based on business requirements
}
