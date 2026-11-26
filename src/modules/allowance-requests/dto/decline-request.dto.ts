import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}
