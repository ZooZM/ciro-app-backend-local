import { Test, TestingModule } from '@nestjs/testing';
import { BillingTickerService } from './billing-ticker.service';
import { TranslationStateService } from './translation-state.service';
import { UsersRepository } from '../../users/users.repository';
import { TranslationUsageRepository } from '../repositories/translation-usage.repository';
import { TranslationUsageEndReason } from '../schemas/translation-usage.schema';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';

const config: TranslationConfig = {
  idleGraceMs: 10_000,
  interimRatePerSec: 2,
  lowBalanceSeconds: 30,
  activationMinSeconds: 1,
  sttRotationLeadMs: 280_000,
  sttRotationOverlapMs: 1_500,
  primaryLanguage: 'en-US',
  candidateLanguages: ['ar-SA', 'fr-FR', 'es-ES'],
  workerRole: 'translation-worker',
};

describe('BillingTickerService', () => {
  let service: BillingTickerService;
  let translationStateService: {
    seedBalance: jest.Mock;
    decrementBalance: jest.Mock;
    clearLowBalanceFlag: jest.Mock;
    markLowBalanceEmitted: jest.Mock;
    deleteBalance: jest.Mock;
  };
  let usersRepository: { decrementTranslationBalance: jest.Mock };
  let translationUsageRepository: {
    startSession: jest.Mock;
    flushConsumption: jest.Mock;
    finalizeSession: jest.Mock;
  };
  let callbacks: { onCreditsLow: jest.Mock; onExhausted: jest.Mock };

  /** In-memory live balance for `decrementBalance`, clamped at 0 like the real Redis helper. */
  let liveBalance: number;

  beforeEach(async () => {
    jest.useFakeTimers();
    liveBalance = 100;

    translationStateService = {
      seedBalance: jest.fn().mockImplementation((_l, _s, seconds: number) => {
        liveBalance = seconds;
        return Promise.resolve();
      }),
      decrementBalance: jest.fn().mockImplementation(() => {
        liveBalance = Math.max(0, liveBalance - 1);
        return Promise.resolve(liveBalance);
      }),
      clearLowBalanceFlag: jest.fn().mockResolvedValue(undefined),
      markLowBalanceEmitted: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false),
      deleteBalance: jest.fn().mockResolvedValue(undefined),
    };
    usersRepository = {
      decrementTranslationBalance: jest.fn().mockResolvedValue(0),
    };
    translationUsageRepository = {
      startSession: jest
        .fn()
        .mockResolvedValue({ _id: { toString: () => 'session-1' } }),
      flushConsumption: jest.fn().mockResolvedValue(undefined),
      finalizeSession: jest.fn().mockResolvedValue(undefined),
    };
    callbacks = { onCreditsLow: jest.fn(), onExhausted: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingTickerService,
        {
          provide: TranslationStateService,
          useValue: translationStateService,
        },
        { provide: UsersRepository, useValue: usersRepository },
        {
          provide: TranslationUsageRepository,
          useValue: translationUsageRepository,
        },
        { provide: TRANSLATION_CONFIG, useValue: config },
      ],
    }).compile();

    service = module.get(BillingTickerService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function start(initialBalanceSeconds = 100) {
    return service.start(
      {
        listenerId: 'listener1',
        roomId: 'room1',
        speakerId: 'speakerA',
        targetLanguage: 'es',
        initialBalanceSeconds,
      },
      callbacks,
    );
  }

  it('seeds the live balance counter from the DB and creates a usage record on start', async () => {
    await start(100);

    expect(translationUsageRepository.startSession).toHaveBeenCalledWith({
      listenerId: 'listener1',
      roomId: 'room1',
      speakerId: 'speakerA',
      targetLanguage: 'es',
    });
    expect(translationStateService.seedBalance).toHaveBeenCalledWith(
      'listener1',
      'session-1',
      100,
    );
    expect(translationStateService.clearLowBalanceFlag).toHaveBeenCalledWith(
      'session-1',
    );
  });

  it('decrements the live balance once per second, matching consumed time within ±1s', async () => {
    await start(100);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(translationStateService.decrementBalance).toHaveBeenCalledTimes(5);
    expect(translationStateService.decrementBalance).toHaveBeenLastCalledWith(
      'listener1',
      'session-1',
      1,
    );
  });

  it('emits credits_low exactly once when the remaining balance first crosses the threshold (FR-024a, SC-015)', async () => {
    await start(31);

    // Tick 1: 31 -> 30 (crosses the default 30s threshold).
    await jest.advanceTimersByTimeAsync(1_000);
    expect(callbacks.onCreditsLow).toHaveBeenCalledTimes(1);
    expect(callbacks.onCreditsLow).toHaveBeenCalledWith(30);

    // Further ticks must not re-emit (markLowBalanceEmitted now returns false).
    await jest.advanceTimersByTimeAsync(2_000);
    expect(callbacks.onCreditsLow).toHaveBeenCalledTimes(1);
  });

  it('closes the branch and emits credits_exhausted when the balance reaches zero (FR-023, FR-024, SC-012)', async () => {
    await start(3);

    await jest.advanceTimersByTimeAsync(3_000);

    expect(callbacks.onExhausted).toHaveBeenCalledTimes(1);
    expect(translationUsageRepository.finalizeSession).toHaveBeenCalledWith(
      'session-1',
      TranslationUsageEndReason.CREDITS_EXHAUSTED,
      3,
    );
    expect(translationStateService.deleteBalance).toHaveBeenCalledWith(
      'listener1',
      'session-1',
    );
    expect(translationStateService.clearLowBalanceFlag).toHaveBeenCalledWith(
      'session-1',
    );
  });

  it('does not decrement after the branch is closed (no billing after teardown)', async () => {
    await start(100);

    await jest.advanceTimersByTimeAsync(2_000);
    expect(translationStateService.decrementBalance).toHaveBeenCalledTimes(2);

    await service.stop(
      'room1',
      'speakerA',
      'listener1',
      TranslationUsageEndReason.USER_UNSUBSCRIBED,
    );

    await jest.advanceTimersByTimeAsync(5_000);
    expect(translationStateService.decrementBalance).toHaveBeenCalledTimes(2);
  });

  it('flushes the atomic DB decrement and usage counters every ~15 seconds (FR-026, SC-013)', async () => {
    await start(100);

    await jest.advanceTimersByTimeAsync(15_000);

    expect(usersRepository.decrementTranslationBalance).toHaveBeenCalledWith(
      'listener1',
      15,
    );
    expect(translationUsageRepository.flushConsumption).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ secondsConsumed: 15 }),
    );
  });

  it('reconciles the final delta and finalizes the usage record on stop', async () => {
    await start(100);

    await jest.advanceTimersByTimeAsync(5_000);
    await service.stop(
      'room1',
      'speakerA',
      'listener1',
      TranslationUsageEndReason.LEFT_CALL,
    );

    expect(usersRepository.decrementTranslationBalance).toHaveBeenCalledWith(
      'listener1',
      5,
    );
    expect(translationUsageRepository.finalizeSession).toHaveBeenCalledWith(
      'session-1',
      TranslationUsageEndReason.LEFT_CALL,
      5,
    );
  });

  it('does not start a duplicate session for a concurrent activation race (no double-spend)', async () => {
    await Promise.all([start(100), start(100)]);

    expect(translationUsageRepository.startSession).toHaveBeenCalledTimes(1);
    expect(translationStateService.seedBalance).toHaveBeenCalledTimes(1);
  });
});
