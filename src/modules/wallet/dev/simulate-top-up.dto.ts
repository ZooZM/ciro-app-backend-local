import { IsInt, Min } from 'class-validator';
import {
  MAX_AMOUNT_DEFAULT,
  MAX_AMOUNT_ENV,
  MaxFromEnv,
} from '../../../common/decorators/max-from-env.decorator';

export class SimulateTopUpDto {
  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  amountHalalas: number;
}
