import { IsIn } from 'class-validator';

export class CreateDeviceSessionDto {
  @IsIn(['watch'])
  deviceType: 'watch';
}
