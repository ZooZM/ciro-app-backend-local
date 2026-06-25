import { ConfigService } from '@nestjs/config';
export interface GoogleServiceAccountCredentials {
    client_email: string;
    private_key: string;
    project_id?: string;
}
export interface GoogleClientAuthOptions {
    [key: string]: string | number | object | undefined;
    projectId?: string;
    credentials?: GoogleServiceAccountCredentials;
    keyFilename?: string;
}
export declare function resolveGoogleClientAuthOptions(configService: ConfigService): GoogleClientAuthOptions;
