import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Min } from 'class-validator';
import { FuelTypes } from '../../fuel-prices/enum/fuel-types-enum';

export class CreatePumpReadingDto {
  @IsEnum(FuelTypes)
  fuelType: FuelTypes;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  liters: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount: number;
}
