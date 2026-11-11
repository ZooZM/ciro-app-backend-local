import { ArrayMinSize, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { FuelTypes } from 'src/modules/fuel-prices/enum/fuel-types-enum';

export class UpdateStationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(FuelTypes, { each: true })
  fuelTypes: FuelTypes[];
}
