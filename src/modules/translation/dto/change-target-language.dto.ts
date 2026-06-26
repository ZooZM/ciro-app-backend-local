import { IsMongoId, IsNotEmpty, IsString, Matches } from 'class-validator';
import { BCP47_PATTERN } from './subscribe-translation.dto';

export class ChangeTargetLanguageDto {
  /** Chat room (call) the speaker and listener share. */
  @IsNotEmpty()
  @IsMongoId()
  roomId: string;

  /** LiveKit/user identity of the speaker being translated. */
  @IsNotEmpty()
  @IsString()
  speakerId: string;

  /** New BCP-47 target language for this listener (FR-002). */
  @IsNotEmpty()
  @IsString()
  @Matches(BCP47_PATTERN, {
    message: 'targetLanguage must be a valid BCP-47 language code',
  })
  targetLanguage: string;
}
