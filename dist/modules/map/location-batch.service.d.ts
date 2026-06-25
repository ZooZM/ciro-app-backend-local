import { OnModuleDestroy } from '@nestjs/common';
export interface LocationBatchItem {
    userId: string;
    longitude: number;
    latitude: number;
    isOnline: boolean;
    lastUpdatedAt: string;
}
export declare class LocationBatchService implements OnModuleDestroy {
    private static readonly FLUSH_INTERVAL_MS;
    private readonly buckets;
    private flushHandler?;
    private readonly timer;
    constructor();
    onFlush(handler: (roomId: string, updates: LocationBatchItem[]) => void): void;
    enqueue(roomId: string, userId: string, item: LocationBatchItem): void;
    cancel(userId: string): void;
    private flush;
    onModuleDestroy(): void;
}
