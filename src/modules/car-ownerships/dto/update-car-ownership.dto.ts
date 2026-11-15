import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateCarOwnershipDto {
  @IsString()
  @IsNotEmpty()
  category: string;
}
