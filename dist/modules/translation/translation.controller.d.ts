import { UsersRepository } from '../users/users.repository';
import { TranslationUsageRepository } from './repositories/translation-usage.repository';
import type { TranslationConfig } from './translation.config';
interface BalanceResponse {
    remainingSeconds: number;
    remainingMinutes: number;
    tier: string;
    status: string;
    lowBalanceThresholdSeconds: number;
}
interface ActiveSessionResponse {
    roomId: string;
    speakerId: string;
    targetLanguage: string;
    startedAt: Date;
    secondsConsumed: number;
}
export declare class TranslationController {
    private readonly usersRepository;
    private readonly translationUsageRepository;
    private readonly config;
    constructor(usersRepository: UsersRepository, translationUsageRepository: TranslationUsageRepository, config: TranslationConfig);
    getBalance(req: {
        user: {
            userId: string;
        };
    }): Promise<BalanceResponse>;
    getActiveSessions(req: {
        user: {
            userId: string;
        };
    }): Promise<ActiveSessionResponse[]>;
}
export {};
