import { IsInt, Min } from 'class-validator';
import {
  MAX_AMOUNT_DEFAULT,
  MAX_AMOUNT_ENV,
  MaxFromEnv,
} from '../../../common/decorators/max-from-env.decorator';

/** Integer halalas only (FR-020): `@IsInt() @Min(1)`, capped by ALLOWANCE_MAX_AMOUNT_HALALAS. */
export class AmountDto {
  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  amountHalalas: number;
}
