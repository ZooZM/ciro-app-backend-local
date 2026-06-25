import { ConfigService } from '@nestjs/config';

/** Minimal shape of a GCP service-account JSON key needed by the Google client libraries. */
export interface GoogleServiceAccountCredentials {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/**
 * Auth options shared by the Speech-to-Text and Translation client factories.
 * The index signature satisfies `ClientOptions` from `google-gax`, which the
 * Speech/Translation client constructors require.
 */
export interface GoogleClientAuthOptions {
  [key: string]: string | number | object | undefined;
  projectId?: string;
  credentials?: GoogleServiceAccountCredentials;
  keyFilename?: string;
}

/**
 * Resolves Google Cloud auth for the Speech-to-Text and Translation clients
 * (Constitution IV — config is read via `ConfigService`, never `process.env`).
 *
 * Preferred: inline service-account JSON via `GOOGLE_APPLICATION_CREDENTIALS_JSON`
 * (same convention as `FIREBASE_SERVICE_ACCOUNT`), so no key file needs to be
 * mounted into the container. Falls back to a key file path
 * (`GOOGLE_APPLICATION_CREDENTIALS`), then to Application Default Credentials
 * when neither is set.
 */
export function resolveGoogleClientAuthOptions(
  configService: ConfigService,
): GoogleClientAuthOptions {
  const projectId = configService.get<string>('GOOGLE_PROJECT_ID');
  const credentialsJson = configService.get<string>(
    'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  );
  const keyFilename = configService.get<string>(
    'GOOGLE_APPLICATION_CREDENTIALS',
  );

  const options: GoogleClientAuthOptions = {};
  if (projectId) options.projectId = projectId;

  if (credentialsJson) {
    options.credentials = JSON.parse(
      credentialsJson,
    ) as GoogleServiceAccountCredentials;
  } else if (keyFilename) {
    options.keyFilename = keyFilename;
  }

  return options;
}
