import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sign as cryptoSign } from 'crypto';
import * as http2 from 'http2';
import { DeviceTokensRepository } from './device-tokens.repository';

/** APNs provider tokens may be reused for up to an hour; refresh well before that. */
export const APNS_JWT_MAX_AGE_MS = 50 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export type ApnsResult = 'sent' | 'unregistered' | 'disabled' | 'failed';

/**
 * 026 (research R9, contracts/push-notifications.md): sends **background**
 * refresh pushes straight to the watch app over APNs (Node `http2`, ES256
 * provider token signed with `JwtService`; no new npm dependency). Visible
 * alerts are not sent here: watchOS mirrors the iPhone's notification.
 * Disabled with one warning when the `APNS_*` env is unset, like
 * `FIREBASE_SERVICE_ACCOUNT`.
 */
@Injectable()
export class ApnsWatchClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApnsWatchClient.name);
  private session?: http2.ClientHttp2Session;
  private cachedJwt?: { token: string; issuedAt: number };

  constructor(
    private readonly config: ConfigService,
    private readonly deviceTokens: DeviceTokensRepository,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.warn('APNS_* not set — watch background pushes disabled');
    }
  }

  onModuleDestroy(): void {
    this.session?.close();
    this.session = undefined;
  }

  isEnabled(): boolean {
    return Boolean(
      this.config.get('APNS_KEY_ID') &&
      this.config.get('APNS_TEAM_ID') &&
      this.config.get('APNS_PRIVATE_KEY') &&
      this.config.get('APNS_WATCH_TOPIC'),
    );
  }

  /** ES256 provider token, cached for at most 50 minutes. */
  providerToken(now = Date.now()): string {
    if (this.cachedJwt && now - this.cachedJwt.issuedAt < APNS_JWT_MAX_AGE_MS) {
      return this.cachedJwt.token;
    }
    // Signed with Node's crypto (JWS ES256 = ECDSA P-256 + SHA-256, raw r||s),
    // so no extra JWT module or dependency is needed for this one token.
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${b64({ alg: 'ES256', kid: this.config.get<string>('APNS_KEY_ID') })}.${b64(
      {
        iss: this.config.get<string>('APNS_TEAM_ID'),
        iat: Math.floor(now / 1000),
      },
    )}`;
    const key = (this.config.get<string>('APNS_PRIVATE_KEY') ?? '').replace(
      /\\n/g,
      '\n',
    );
    const signature = cryptoSign('sha256', Buffer.from(input), {
      key,
      dsaEncoding: 'ieee-p1363',
    });
    const token = `${input}.${signature.toString('base64url')}`;
    this.cachedJwt = { token, issuedAt: now };
    return token;
  }

  private authority(): string {
    return this.config.get('APNS_ENV') === 'production'
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
  }

  private connection(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed)
      return this.session;
    const session = http2.connect(this.authority());
    session.on('error', (err: Error) =>
      this.logger.warn(`APNs connection error: ${err.message}`),
    );
    session.on('close', () => {
      if (this.session === session) this.session = undefined;
    });
    this.session = session;
    return session;
  }

  /**
   * Sends one background push. `410` or `400 BadDeviceToken` deletes the
   * token row. Never throws.
   */
  async sendBackground(
    deviceToken: string,
    payload: Record<string, unknown>,
  ): Promise<ApnsResult> {
    if (!this.isEnabled()) return 'disabled';
    let status = 0;
    let body = '';
    try {
      ({ status, body } = await this.request(deviceToken, payload));
    } catch (err) {
      this.logger.warn(`APNs request failed: ${(err as Error).message}`);
      this.session?.destroy();
      this.session = undefined;
      return 'failed';
    }
    if (status === 200) return 'sent';
    let reason = '';
    try {
      reason = (JSON.parse(body) as { reason?: string }).reason ?? '';
    } catch {
      /* ignore */
    }
    if (status === 410 || (status === 400 && reason === 'BadDeviceToken')) {
      await this.deviceTokens.deleteToken(deviceToken);
      return 'unregistered';
    }
    this.logger.warn(`APNs answered ${status} ${reason}`);
    return 'failed';
  }

  private request(
    deviceToken: string,
    payload: Record<string, unknown>,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = this.connection().request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.providerToken()}`,
        'apns-topic': this.config.get<string>('APNS_WATCH_TOPIC'),
        'apns-push-type': 'background',
        'apns-priority': '5',
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      req.setEncoding('utf8');
      req.setTimeout(REQUEST_TIMEOUT_MS, () =>
        req.close(http2.constants.NGHTTP2_CANCEL),
      );
      req.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      req.on('data', (chunk: string) => (body += chunk));
      req.on('end', () => resolve({ status, body }));
      req.on('error', reject);
      req.end(JSON.stringify(payload));
    });
  }
}
