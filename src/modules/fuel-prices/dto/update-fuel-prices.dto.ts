import { IsNumber } from 'class-validator';

export class UpdateFuelPricesDto {
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
