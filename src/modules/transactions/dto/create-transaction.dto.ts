import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { TransactionType } from '../enum/transaction-type.enum';
import type { UUID } from 'crypto';

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  type: TransactionType;

  @IsUUID()
  @IsNotEmpty()
  transaction: UUID;
}
