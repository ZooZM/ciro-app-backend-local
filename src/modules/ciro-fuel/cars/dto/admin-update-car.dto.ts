import { PartialType } from '@nestjs/mapped-types';
import { UpdateCarDto } from './update-car.dto';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminUpdateCarDto extends PartialType(UpdateCarDto) {
  @IsBoolean()
  @IsOptional()
  isGpsEnabled?: boolean;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  gpsId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nfcId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  bankCardNumber?: string;
}
