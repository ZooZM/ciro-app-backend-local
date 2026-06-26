import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';

/** TTL for the `xlation:owner:*` lock; refreshed periodically while a pipeline is active. */
const OWNER_LOCK_TTL_SECONDS = 60;

/**
 * Redis-backed authoritative runtime state for the translation feature
 * (data-model.md §2). Mirrors the existing `screenshare:active:*` `SET NX`
 * lock pattern from `ChatGateway` for `xlation:owner:*`.
 */
@Injectable()
export class TranslationStateService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  private subsKey(roomId: string, speakerId: string): string {
    return `xlation:subs:${roomId}:${speakerId}`;
  }

  private ownerKey(roomId: string, speakerId: string): string {
    return `xlation:owner:${roomId}:${speakerId}`;
  }

  private balanceKey(listenerId: string, sessionId: string): string {
    return `xlation:balance:${listenerId}:${sessionId}`;
  }

  private lowFlagKey(sessionId: string): string {
    return `xlation:lowflag:${sessionId}`;
  }

  // --- Subscription intent (xlation:subs:{room}:{speaker}) ---

  /** Adds/updates a listener's subscription intent; returns the new refcount. */
  async addSubscriber(
    roomId: string,
    speakerId: string,
    listenerId: string,
    targetLanguage: string,
  ): Promise<number> {
    await this.redis.hset(
      this.subsKey(roomId, speakerId),
      listenerId,
      targetLanguage,
    );
    return this.getRefCount(roomId, speakerId);
  }

  /** Removes a listener's subscription intent; returns the new refcount. */
  async removeSubscriber(
    roomId: string,
    speakerId: string,
    listenerId: string,
  ): Promise<number> {
    await this.redis.hdel(this.subsKey(roomId, speakerId), listenerId);
    return this.getRefCount(roomId, speakerId);
  }

  /** Refcount for a (room, speaker) pipeline = number of distinct subscribers. */
  async getRefCount(roomId: string, speakerId: string): Promise<number> {
    return this.redis.hlen(this.subsKey(roomId, speakerId));
  }

  /** All current `listenerId -> targetLanguage` subscriptions for a (room, speaker). */
  async getSubscribers(
    roomId: string,
    speakerId: string,
  ): Promise<Record<string, string>> {
    return this.redis.hgetall(this.subsKey(roomId, speakerId));
  }

  async deleteSubscriptions(roomId: string, speakerId: string): Promise<void> {
    await this.redis.del(this.subsKey(roomId, speakerId));
  }

  // --- Pipeline ownership lock (xlation:owner:{room}:{speaker}) ---

  /** Acquires the pipeline ownership lock via `SET NX`, mirroring `screenshare:active:*`. */
  async acquireOwnership(
    roomId: string,
    speakerId: string,
    instanceId: string,
    ttlSeconds = OWNER_LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.ownerKey(roomId, speakerId),
      instanceId,
      'EX',
      ttlSeconds,
      'NX',
    );
    return result === 'OK';
  }

  /** Refreshes the ownership lock TTL while the pipeline remains active. */
  async refreshOwnership(
    roomId: string,
    speakerId: string,
    ttlSeconds = OWNER_LOCK_TTL_SECONDS,
  ): Promise<void> {
    await this.redis.expire(this.ownerKey(roomId, speakerId), ttlSeconds);
  }

  async getOwner(roomId: string, speakerId: string): Promise<string | null> {
    return this.redis.get(this.ownerKey(roomId, speakerId));
  }

  /** Releases the ownership lock only if still held by this instance. */
  async releaseOwnership(
    roomId: string,
    speakerId: string,
    instanceId: string,
  ): Promise<void> {
    const current = await this.redis.get(this.ownerKey(roomId, speakerId));
    if (current === instanceId) {
      await this.redis.del(this.ownerKey(roomId, speakerId));
    }
  }

  // --- Billing live counters (xlation:balance / xlation:lowflag) ---

  /** Seeds the live per-session balance counter from the DB value at session start. */
  async seedBalance(
    listenerId: string,
    sessionId: string,
    seconds: number,
  ): Promise<void> {
    await this.redis.set(
      this.balanceKey(listenerId, sessionId),
      Math.max(0, Math.floor(seconds)),
    );
  }

  /** Decrements the live balance counter, clamped at 0 (FR-026). */
  async decrementBalance(
    listenerId: string,
    sessionId: string,
    by = 1,
  ): Promise<number> {
    const remaining = await this.redis.decrby(
      this.balanceKey(listenerId, sessionId),
      by,
    );
    if (remaining < 0) {
      await this.redis.set(this.balanceKey(listenerId, sessionId), 0);
      return 0;
    }
    return remaining;
  }

  async getBalance(listenerId: string, sessionId: string): Promise<number> {
    const value = await this.redis.get(this.balanceKey(listenerId, sessionId));
    return value ? parseInt(value, 10) : 0;
  }

  async deleteBalance(listenerId: string, sessionId: string): Promise<void> {
    await this.redis.del(this.balanceKey(listenerId, sessionId));
  }

  /** Marks `credits_low` as emitted for this session; returns true the first time only (SC-015). */
  async markLowBalanceEmitted(sessionId: string): Promise<boolean> {
    const result = await this.redis.set(this.lowFlagKey(sessionId), '1', 'NX');
    return result === 'OK';
  }

  async clearLowBalanceFlag(sessionId: string): Promise<void> {
    await this.redis.del(this.lowFlagKey(sessionId));
  }
}
