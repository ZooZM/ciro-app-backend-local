import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class CreateCarOwnershipDto {
  @IsMongoId()
  @IsNotEmpty()
  owner: string;

  @IsMongoId()
  @IsNotEmpty()
  car: string;

  @IsString()
  @IsNotEmpty()
  category: string;
}
