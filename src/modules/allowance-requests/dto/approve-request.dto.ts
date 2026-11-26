import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import {
  MAX_REQUEST_DEFAULT,
  MAX_REQUEST_ENV,
  MaxFromEnv,
} from '../../../common/decorators/max-from-env.decorator';

/** Full amount = the request amount; partial is 0 < x < amount (FR-054). */
export class ApproveRequestDto {
  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_REQUEST_ENV, MAX_REQUEST_DEFAULT)
  amountHalalas: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}
