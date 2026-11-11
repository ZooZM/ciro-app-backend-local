import { IsNumber } from 'class-validator';
import { FuelTypes } from '../enum/fuel-types-enum';

export class UpdateFuelPricesDto implements Record<FuelTypes, number> {
  @IsNumber()
  gasoline_91!: number;

  @IsNumber()
  gasoline_95!: number;

  @IsNumber()
  gasoline_98!: number;

  @IsNumber()
  diesel!: number;

  @IsNumber()
  kerosene!: number;
}
