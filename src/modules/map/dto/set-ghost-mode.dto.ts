import { IsBoolean } from 'class-validator';

export class SetGhostModeDto {
  @IsBoolean()
  enabled: boolean;
}
