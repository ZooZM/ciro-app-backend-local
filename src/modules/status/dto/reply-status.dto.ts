import { IsNotEmpty, IsString } from 'class-validator';

export class ReplyStatusDto {
  @IsNotEmpty()
  @IsString()
  message: string;
}
