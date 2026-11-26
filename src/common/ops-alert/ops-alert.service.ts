import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * 026 (FR-022, SC-006): raises operations alerts. Always logs an
 * `[OPS ALERT] <code>` error line; when `OPS_ALERT_WEBHOOK_URL` is set it also
 * POSTs `{ code, message, details, at }` there. Never throws: an alert must
 * not break the code path that raised it.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger('OpsAlert');

  constructor(private readonly config: ConfigService) {}

  async alert(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const at = new Date().toISOString();
    this.logger.error(
      `[OPS ALERT] ${code} ${message}${details ? ` ${safeJson(details)}` : ''}`,
    );

    const url = this.config.get<string>('OPS_ALERT_WEBHOOK_URL');
    if (!url) return;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, message, details: details ?? null, at }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          `[OPS ALERT] webhook answered ${response.status} for ${code}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[OPS ALERT] webhook failed for ${code}: ${(err as Error).message}`,
      );
    }
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable details]';
  }
}
