import { IsEnum, IsMongoId, IsNotEmpty, IsOptional } from 'class-validator';
import { DriverInvitationStatus } from '../enum/driver-invitation-status.enum';

export class CreateDriverInvitationDto {
  @IsMongoId()
  @IsNotEmpty()
  owner: string;

  @IsMongoId()
  @IsNotEmpty()
  driver: string;

  @IsMongoId()
  @IsNotEmpty()
  car: string;
}
