import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
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

  // Device's current GPS position at the moment of posting — only required
  // for SHOW_ON_MAP, where it becomes the pin location on viewers' maps
  // (014-status-feature-integration map pin).
  @ValidateIf((dto) => dto.privacy === StatusPrivacy.SHOW_ON_MAP)
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ValidateIf((dto) => dto.privacy === StatusPrivacy.SHOW_ON_MAP)
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

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
