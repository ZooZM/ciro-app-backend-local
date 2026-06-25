import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { StatusContentType, StatusPrivacy } from '../schemas/status.schema';
import { IsAudienceArray } from './audience.validator';

export class CreateStatusDto {
  @IsNotEmpty()
  @IsString()
  clientStatusId: string;

  @IsNotEmpty()
  @IsEnum(StatusContentType)
  contentType: StatusContentType;

  @ValidateIf((dto) => dto.contentType === StatusContentType.TEXT)
  @IsNotEmpty()
  @IsString()
  textContent?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  fontStyle?: string;

  @IsOptional()
  @IsString()
  musicTrackId?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsNotEmpty()
  @IsEnum(StatusPrivacy)
  privacy: StatusPrivacy;

  @ValidateIf((dto) => dto.privacy === StatusPrivacy.PRIVATE)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsAudienceArray()
  audience?: string[];
}
