import { IsMongoId, IsNotEmpty, IsString, Matches } from 'class-validator';

/** BCP-47-ish language tag, e.g. `en`, `en-US`, `zh-Hans-CN`. */
export const BCP47_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export class SubscribeTranslationDto {
  /** Chat room (call) the speaker and listener share. */
  @IsNotEmpty()
  @IsMongoId()
  roomId: string;

  /** LiveKit/user identity of the speaker to translate. */
  @IsNotEmpty()
  @IsString()
  speakerId: string;

  /** BCP-47 language code the listener wants captions in (FR-002). */
  @IsNotEmpty()
  @IsString()
  @Matches(BCP47_PATTERN, {
    message: 'targetLanguage must be a valid BCP-47 language code',
  })
  targetLanguage: string;
}
