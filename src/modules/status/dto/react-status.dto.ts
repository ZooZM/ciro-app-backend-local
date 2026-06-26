import { IsNotEmpty, IsString } from 'class-validator';

export class ReactStatusDto {
  @IsNotEmpty()
  @IsString()
  reaction: string;
}
