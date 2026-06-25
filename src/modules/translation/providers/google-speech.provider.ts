import { ConfigService } from '@nestjs/config';
import { v1 } from '@google-cloud/speech';
import type { Provider } from '@nestjs/common';
import { resolveGoogleClientAuthOptions } from './google-credentials.util';

/** DI token for the shared {@link v1.SpeechClient}. */
export const GOOGLE_SPEECH_CLIENT = 'GOOGLE_SPEECH_CLIENT';

/**
 * Typed factory for the Google Cloud Speech-to-Text v1 streaming client.
 * Credentials come from `GOOGLE_APPLICATION_CREDENTIALS_JSON` /
 * `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_PROJECT_ID` (Joi-validated in
 * AppModule); falls back to Application Default Credentials when unset,
 * matching standard Google client library behavior.
 */
export const googleSpeechClientProvider: Provider = {
  provide: GOOGLE_SPEECH_CLIENT,
  useFactory: (configService: ConfigService): v1.SpeechClient => {
    return new v1.SpeechClient(resolveGoogleClientAuthOptions(configService));
  },
  inject: [ConfigService],
};
