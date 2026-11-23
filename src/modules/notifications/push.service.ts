import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { DeviceTokensRepository } from './device-tokens.repository';
import { ApnsWatchClient } from './apns-watch.client';
import type { PushLocale } from './device-token.schema';

export type PushAudience = 'phone' | 'watch' | 'all';

/**
 * 026 (contracts/push-notifications.md): a typed, localized push. Text is
 * rendered per device token in that token's locale.
 */
export interface PushMessage {
  /** `data.type`, e.g. `allowance.requestCreated`. */
  type: string;
  /** Extra `data` fields; values are stringified (FCM requires strings). */
  data?: Record<string, string | number | boolean | null | undefined>;
  render: (locale: PushLocale) => { title: string; body: string };
  /** iOS notification category (actionable notifications). */
  apnsCategory?: string;
  /** iOS `thread-id` and Android notification `tag`. */
  threadId?: string;
  /** Android notification channel. */
  androidChannelId?: string;
}

export function stringifyData(
  type: string,
  data: PushMessage['data'] = {},
): Record<string, string> {
  const out: Record<string, string> = { type };
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

  /** Last watch refresh push per child, for the 2 s in-memory debounce. */
  private readonly lastWatchRefresh = new Map<string, number>();

  constructor(
    private readonly deviceTokensRepository: DeviceTokensRepository,
    // Optional so older tests and phone-only setups can build the service without it.
    @Optional() private readonly apnsWatch?: ApnsWatchClient,
  ) {}

  onModuleInit() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled',
      );
      return;
    }
    if (admin.apps.length > 0) return;
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
    });
    this.logger.log('Firebase Admin initialised');
  }

  async sendPush(
    deviceToken: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    if (admin.apps.length === 0) return;
    try {
      await admin.messaging().send({
        token: deviceToken,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      });
    } catch (err) {
      this.logger.warn(`Failed to send push to ${deviceToken}: ${err.message}`);
    }
  }

  /**
   * 026: sends one typed message to every device of `userId`. `phone`
   * covers FCM tokens (`fcm`, `apns`); `apns-watch` tokens get only
   * background refresh pushes (see `sendWatchRefresh`). Never throws.
   */
  async sendToUser(
    userId: string,
    message: PushMessage,
    options: { audience: PushAudience } = { audience: 'phone' },
  ): Promise<void> {
    let tokens;
    try {
      tokens = await this.deviceTokensRepository.getTokens(userId);
    } catch (err) {
      this.logger.warn(
        `sendToUser(${userId}) token lookup failed: ${(err as Error).message}`,
      );
      return;
    }
    const wantPhone = options.audience !== 'watch';
    const wantWatch =
      options.audience === 'watch' || options.audience === 'all';
    for (const doc of tokens) {
      if (doc.platform === 'apns-watch') {
        // The watch only ever gets background refresh pushes, never visible alerts.
        if (wantWatch) {
          await this.apnsWatch?.sendBackground(
            doc.token,
            this.watchPayload(message.data),
          );
        }
        continue;
      }
      if (wantPhone) await this.sendFcm(doc.token, message, doc.locale ?? 'ar');
    }
  }

  private watchPayload(
    data: PushMessage['data'] = {},
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {
      aps: { 'content-available': 1 },
      type: 'allowance.changed',
    };
    if (data.childId !== undefined && data.childId !== null)
      out.childId = String(data.childId);
    if (data.rev !== undefined && data.rev !== null) out.rev = String(data.rev);
    return out;
  }

  /**
   * 026 (R9): a background push that makes the child's watch refresh.
   * Debounced to one per child per 2 s window on this instance.
   */
  async sendWatchRefresh(
    childUserId: string,
    rev?: number,
    opts: { now?: number; force?: boolean } = {},
  ): Promise<void> {
    const now = opts.now ?? Date.now();
    const last = this.lastWatchRefresh.get(childUserId);
    if (!opts.force && last !== undefined && now - last < 2000) return;
    this.lastWatchRefresh.set(childUserId, now);
    if (this.lastWatchRefresh.size > 5000) {
      for (const [k, t] of this.lastWatchRefresh)
        if (now - t > 60_000) this.lastWatchRefresh.delete(k);
    }
    try {
      const tokens = await this.deviceTokensRepository.getTokens(childUserId);
      for (const doc of tokens) {
        if (doc.platform !== 'apns-watch') continue;
        await this.apnsWatch?.sendBackground(
          doc.token,
          this.watchPayload({
            childId: childUserId,
            ...(rev !== undefined ? { rev } : {}),
          }),
        );
      }
    } catch (err) {
      this.logger.warn(
        `sendWatchRefresh(${childUserId}) failed: ${(err as Error).message}`,
      );
    }
  }

  private async sendFcm(
    token: string,
    message: PushMessage,
    locale: PushLocale,
  ): Promise<void> {
    if (admin.apps.length === 0) return;
    try {
      const { title, body } = message.render(locale);
      const aps: Record<string, unknown> = { sound: 'default' };
      if (message.apnsCategory) aps.category = message.apnsCategory;
      if (message.threadId) aps['thread-id'] = message.threadId;
      await admin.messaging().send({
        token,
        notification: { title, body },
        data: stringifyData(message.type, message.data),
        apns: { payload: { aps } },
        android: {
          notification: {
            channelId: message.androidChannelId ?? 'allowance',
            ...(message.threadId ? { tag: message.threadId } : {}),
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to send ${message.type} push: ${(err as Error).message}`,
      );
    }
  }

  async notifyOfflineUser(
    userId: string,
    message: { content: string; senderName?: string; roomId: string },
  ): Promise<void> {
    const tokens = await this.deviceTokensRepository.getTokens(userId);
    for (const doc of tokens) {
      await this.sendPush(doc.token, {
        title: message.senderName ?? 'New message',
        body: message.content || 'You have a new message',
        data: { roomId: message.roomId },
      });
    }
  }

  async notifyStatusReaction(
    userId: string,
    message: { reactorName: string; statusId: string },
  ): Promise<void> {
    const tokens = await this.deviceTokensRepository.getTokens(userId);
    for (const doc of tokens) {
      await this.sendPush(doc.token, {
        title: message.reactorName || 'Someone',
        body: 'loved your status',
        data: { type: 'statusReaction', statusId: message.statusId },
      });
    }
  }
}
