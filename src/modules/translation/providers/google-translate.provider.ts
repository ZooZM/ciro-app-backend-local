import { ConfigService } from '@nestjs/config';
import { v3 } from '@google-cloud/translate';
import type { Provider } from '@nestjs/common';
import { resolveGoogleClientAuthOptions } from './google-credentials.util';

/** DI token for the shared {@link v3.TranslationServiceClient}. */
export const GOOGLE_TRANSLATE_CLIENT = 'GOOGLE_TRANSLATE_CLIENT';

/**
 * Typed factory for the Google Cloud Translation v3 client.
 * Credentials come from `GOOGLE_APPLICATION_CREDENTIALS_JSON` /
 * `GOOGLE_APPLICATION_CREDENTIALS` / `GOOGLE_PROJECT_ID` (Joi-validated in
 * AppModule); falls back to Application Default Credentials when unset,
 * matching standard Google client library behavior.
 */
export const googleTranslateClientProvider: Provider = {
  provide: GOOGLE_TRANSLATE_CLIENT,
  useFactory: (configService: ConfigService): v3.TranslationServiceClient => {
    return new v3.TranslationServiceClient(
      resolveGoogleClientAuthOptions(configService),
    );
  },
  inject: [ConfigService],
};
