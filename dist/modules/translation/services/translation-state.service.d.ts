import type { Redis } from 'ioredis';
export declare class TranslationStateService {
    private readonly redis;
    constructor(redis: Redis);
    private subsKey;
    private ownerKey;
    private balanceKey;
    private lowFlagKey;
    addSubscriber(roomId: string, speakerId: string, listenerId: string, targetLanguage: string): Promise<number>;
    removeSubscriber(roomId: string, speakerId: string, listenerId: string): Promise<number>;
    getRefCount(roomId: string, speakerId: string): Promise<number>;
    getSubscribers(roomId: string, speakerId: string): Promise<Record<string, string>>;
    deleteSubscriptions(roomId: string, speakerId: string): Promise<void>;
    acquireOwnership(roomId: string, speakerId: string, instanceId: string, ttlSeconds?: number): Promise<boolean>;
    refreshOwnership(roomId: string, speakerId: string, ttlSeconds?: number): Promise<void>;
    getOwner(roomId: string, speakerId: string): Promise<string | null>;
    releaseOwnership(roomId: string, speakerId: string, instanceId: string): Promise<void>;
    seedBalance(listenerId: string, sessionId: string, seconds: number): Promise<void>;
    decrementBalance(listenerId: string, sessionId: string, by?: number): Promise<number>;
    getBalance(listenerId: string, sessionId: string): Promise<number>;
    deleteBalance(listenerId: string, sessionId: string): Promise<void>;
    markLowBalanceEmitted(sessionId: string): Promise<boolean>;
    clearLowBalanceFlag(sessionId: string): Promise<void>;
}
