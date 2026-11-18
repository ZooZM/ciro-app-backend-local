import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { FuelTypes } from '../../fuel-prices/enum/fuel-types-enum';

export class CreateCiroFuelTransactionDto {
  @IsNumber()
  @Min(0)
  amountPaid: number;

  @IsNumber()
  @Min(0)
  amountRefueled: number;

  @IsMongoId()
  @IsNotEmpty()
  station: string;

  @IsMongoId()
  @IsNotEmpty()
  car: string;

  @IsMongoId()
  @IsNotEmpty()
  driver: string;

  @IsMongoId()
  @IsNotEmpty()
  owner: string;

  @IsMongoId()
  @IsNotEmpty()
  paymentVerification: string;

  @IsEnum(FuelTypes)
  fuelType: FuelTypes;
}
