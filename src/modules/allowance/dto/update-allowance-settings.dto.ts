import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_AMOUNT_DEFAULT,
  MAX_AMOUNT_ENV,
  MaxFromEnv,
} from '../../../common/decorators/max-from-env.decorator';
import { BLOCKABLE_CATEGORIES } from '../../family-core/family-core.constants';
import type { BlockableCategory } from '../../family-core/family-core.constants';

/** 026 contracts/rest-api.md `PUT /allowance/children/{childId}/settings`: every field is required (FR-010–013). */
export class UpdateAllowanceSettingsDto {
  @IsInt()
  @Min(0)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  monthlyAmountHalalas: number;

  @IsInt()
  @Min(1)
  @Max(31)
  payoutDay: number;

  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  dailyLimitHalalas: number;

  @IsInt()
  @Min(1)
  @MaxFromEnv(MAX_AMOUNT_ENV, MAX_AMOUNT_DEFAULT)
  perPurchaseMaxHalalas: number;

  /** Blockable categories only: always-blocked ones are implicit and rejected here (FR-011). */
  @IsArray()
  @ArrayUnique()
  @IsIn(BLOCKABLE_CATEGORIES, { each: true })
  blockedCategories: BlockableCategory[];

  @IsBoolean()
  purchaseNotifications: boolean;
}
