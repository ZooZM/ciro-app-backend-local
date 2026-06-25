import { Injectable, OnModuleDestroy } from '@nestjs/common';

export interface LocationBatchItem {
  userId: string;
  longitude: number;
  latitude: number;
  isOnline: boolean;
  lastUpdatedAt: string;
}

/**
 * 018-snap-map-realtime (FR-006a / SC-012): guards against a "thundering
 * herd" in large shared groups by accumulating `shareLocation` writes and
 * flushing one coalesced batch per room on a fixed interval, instead of
 * fanning out every individual update instantly. `ChatGateway` is the only
 * consumer — it registers a flush handler and calls `enqueue`.
 */
@Injectable()
export class LocationBatchService implements OnModuleDestroy {
  private static readonly FLUSH_INTERVAL_MS = 5000;

  private readonly buckets = new Map<string, Map<string, LocationBatchItem>>();
  private flushHandler?: (roomId: string, updates: LocationBatchItem[]) => void;
  private readonly timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(
      () => this.flush(),
      LocationBatchService.FLUSH_INTERVAL_MS,
    );
  }

  onFlush(handler: (roomId: string, updates: LocationBatchItem[]) => void) {
    this.flushHandler = handler;
  }

  /** Coalesces repeated updates for the same user within an interval to the latest value. */
  enqueue(roomId: string, userId: string, item: LocationBatchItem) {
    if (!this.buckets.has(roomId)) this.buckets.set(roomId, new Map());
    this.buckets.get(roomId)!.set(userId, item);
  }

  /**
   * Drops any not-yet-flushed update for `userId` across every room. Used
   * when sharing stops (or Ghost Mode turns on) right after a `shareLocation`
   * was enqueued but before the next flush tick — without this, the stale
   * queued update would flush moments after the "stopped/hidden" signal and
   * resurrect a marker that was just removed.
   */
  cancel(userId: string) {
    for (const bucket of this.buckets.values()) {
      bucket.delete(userId);
    }
  }

  private flush() {
    if (!this.flushHandler || this.buckets.size === 0) return;
    for (const [roomId, bucket] of this.buckets) {
      if (bucket.size === 0) continue;
      this.flushHandler(roomId, Array.from(bucket.values()));
      bucket.clear();
    }
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }
}
