import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** 026 contracts/rest-api.md: a base64url link code (16 random bytes → 22 chars). */
export class LinkCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code must be base64url' })
  code: string;
}
