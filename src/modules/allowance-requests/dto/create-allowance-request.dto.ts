import { IsIn, IsInt, Min } from 'class-validator';
import {
  MAX_REQUEST_DEFAULT,
  MAX_REQUEST_ENV,
  MaxFromEnv,
} from '../../../common/decorators/max-from-env.decorator';
import {
  REQUEST_REASONS,
  REQUEST_SOURCES,
} from '../../family-core/family-core.constants';
import type {
  RequestReason,
  RequestSource,
} from '../../family-core/family-core.constants';

/** 026 contracts/rest-api.md `POST /allowance-requests` (FR-050). */
export class CreateAllowanceRequestDto {
  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_REQUEST_ENV, MAX_REQUEST_DEFAULT)
  amountHalalas: number;

  @IsIn(REQUEST_REASONS)
  reason: RequestReason;

  @IsIn(REQUEST_SOURCES)
  source: RequestSource;
}
