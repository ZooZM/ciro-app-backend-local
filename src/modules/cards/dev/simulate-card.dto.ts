import {
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_AMOUNT_DEFAULT,
  MAX_AMOUNT_ENV,
  MaxFromEnv,
} from '../../../common/decorators/max-from-env.decorator';
import { SPENDING_CATEGORIES } from '../../family-core/family-core.constants';
import type { SpendingCategory } from '../../family-core/family-core.constants';

export class SimulatePurchaseDto {
  @IsOptional()
  @IsMongoId()
  childId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  merchantName: string;

  @IsIn(SPENDING_CATEGORIES)
  category: SpendingCategory;

  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  amountHalalas: number;
}

export class SimulateRefundDto {
  @IsOptional()
  @IsMongoId()
  childId?: string;

  @IsMongoId()
  originalTransactionId: string;

  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  amountHalalas: number;
}
