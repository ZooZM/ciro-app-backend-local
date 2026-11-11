import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { FuelTypes } from 'src/modules/fuel-prices/enum/fuel-types-enum';

export class CreateStationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(FuelTypes, { each: true })
  fuelTypes: FuelTypes[];

  @IsString()
  @IsNotEmpty()
  address: string;
}
