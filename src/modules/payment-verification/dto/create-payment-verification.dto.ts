import {
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePaymentVerificationDto {
  @IsString()
  @IsNotEmpty()
  nfcId: string;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;
}
