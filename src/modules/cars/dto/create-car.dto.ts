import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { VehicleCategory } from '../enum/vehicle-category.enum';
import { FuelTypes } from '../../fuel-prices/enum/fuel-types-enum';

// Latin letters, e.g. "ABC 1234", "ABC1234", "A B C 123"
// const KSA_PLATE_LATIN = /^[ABJDRSXTEGKLZNHUV]{3}\d{1,4}$/;

// Arabic letters, e.g. "أ ب ج 1234" (Arabic-Indic digits allowed)
// const KSA_PLATE_ARABIC = /^[أابحدرسصطعقكلمنهوىي]{3}[0-9٠-٩]{1,4}$/;

const KSA_PLATE =
  /^(?:[ABJDRSXTEGKLZNHUV]{3}\d{1,4}|[أابحدرسصطعقكلمنهوىي]{3}[0-9٠-٩]{1,4})$/;

export class CreateCarDto {
  @IsString()
  @IsNotEmpty()
  model: string;

  @IsString()
  @IsNotEmpty()
  brand: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Matches(KSA_PLATE, {
    message: 'licensePlate must be a valid KSA plate (3 letters + 1-4 digits)',
  })
  licensePlate: string;

  @IsEnum(VehicleCategory)
  vehicleCategory: string;

  @IsEnum(FuelTypes)
  fuelType: FuelTypes;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsBoolean()
  @IsOptional()
  isActive: boolean;

  @IsMongoId()
  @IsNotEmpty()
  owner: string;

  @IsNumber()
  tankCapacity: number;
}
