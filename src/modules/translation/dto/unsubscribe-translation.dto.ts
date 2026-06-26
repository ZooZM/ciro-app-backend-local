import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';

export class UnsubscribeTranslationDto {
  /** Chat room (call) the speaker and listener share. */
  @IsNotEmpty()
  @IsMongoId()
  roomId: string;

  /** LiveKit/user identity of the speaker being translated. */
  @IsNotEmpty()
  @IsString()
  speakerId: string;
}
