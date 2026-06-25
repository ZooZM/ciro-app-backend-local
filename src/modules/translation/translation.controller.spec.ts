import { Test, TestingModule } from '@nestjs/testing';
import { TranslationController } from './translation.controller';
import { UsersRepository } from '../users/users.repository';
import { TranslationUsageRepository } from './repositories/translation-usage.repository';
import { TRANSLATION_CONFIG } from './translation.config';

describe('TranslationController', () => {
  let controller: TranslationController;
  let getTranslationSubscriptionInfo: jest.Mock;
  let findActiveSessions: jest.Mock;

  const req = { user: { userId: 'listener-1' } };

  beforeEach(async () => {
    getTranslationSubscriptionInfo = jest.fn();
    findActiveSessions = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TranslationController],
      providers: [
        {
          provide: UsersRepository,
          useValue: { getTranslationSubscriptionInfo },
        },
        {
          provide: TranslationUsageRepository,
          useValue: { findActiveSessions },
        },
        { provide: TRANSLATION_CONFIG, useValue: { lowBalanceSeconds: 30 } },
      ],
    }).compile();

    controller = module.get(TranslationController);
  });

  describe('getBalance', () => {
    it('projects seconds + floor minutes and the low-balance threshold, with no sensitive fields', async () => {
      getTranslationSubscriptionInfo.mockResolvedValue({
        translationSecondsBalance: 125,
        tier: 'PRO',
        status: 'ACTIVE',
      });

      const result = await controller.getBalance(req);

      expect(getTranslationSubscriptionInfo).toHaveBeenCalledWith('listener-1');
      expect(result).toEqual({
        remainingSeconds: 125,
        remainingMinutes: 2,
        tier: 'PRO',
        status: 'ACTIVE',
        lowBalanceThresholdSeconds: 30,
      });
      expect(result).not.toHaveProperty('paymentCustomerId');
      expect(result).not.toHaveProperty('expiresAt');
    });

    it('floors zero balance to zero minutes', async () => {
      getTranslationSubscriptionInfo.mockResolvedValue({
        translationSecondsBalance: 0,
        tier: 'FREE',
        status: 'ACTIVE',
      });

      const result = await controller.getBalance(req);

      expect(result.remainingSeconds).toBe(0);
      expect(result.remainingMinutes).toBe(0);
    });
  });

  describe('getActiveSessions', () => {
    it('returns the shape from contracts/rest-endpoints.md', async () => {
      const startedAt = new Date('2026-06-15T10:00:00.000Z');
      findActiveSessions.mockResolvedValue([
        {
          roomId: 'room-1',
          speakerId: 'speaker-1',
          targetLanguage: 'en',
          startedAt,
          secondsConsumed: 42,
        },
      ]);

      const result = await controller.getActiveSessions(req);

      expect(findActiveSessions).toHaveBeenCalledWith('listener-1');
      expect(result).toEqual([
        {
          roomId: 'room-1',
          speakerId: 'speaker-1',
          targetLanguage: 'en',
          startedAt,
          secondsConsumed: 42,
        },
      ]);
    });

    it('returns an empty array when there are no active sessions', async () => {
      findActiveSessions.mockResolvedValue([]);

      const result = await controller.getActiveSessions(req);

      expect(result).toEqual([]);
    });
  });
});
