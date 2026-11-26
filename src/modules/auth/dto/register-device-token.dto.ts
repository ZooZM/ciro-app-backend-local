import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  DEVICE_PLATFORMS,
  PUSH_LOCALES,
} from '../../notifications/device-token.schema';
import type {
  DevicePlatform,
  PushLocale,
} from '../../notifications/device-token.schema';

/** 026 contracts/rest-api.md `POST /auth/device-token`. */
export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;

  @IsIn(DEVICE_PLATFORMS)
  platform: DevicePlatform;

  @IsOptional()
  @IsIn(PUSH_LOCALES)
  locale?: PushLocale;
}
