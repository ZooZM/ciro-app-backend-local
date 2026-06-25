import { Test, TestingModule } from '@nestjs/testing';
import { TranslationManagerService } from './translation-manager.service';
import {
  SpeechPipelineService,
  type SpeechPipelineCallbacks,
  type OpenPipelineHandle,
} from './speech-pipeline.service';
import { TranslationStateService } from './translation-state.service';
import {
  TranslationService,
  type TranslationResult,
} from './translation.service';
import {
  CaptionDispatchService,
  type DispatchCaptionInput,
} from './caption-dispatch.service';
import { SpeakerLanguageCache } from './language-detection.util';
import { UsersRepository } from '../../users/users.repository';
import { BillingTickerService } from './billing-ticker.service';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';

/**
 * T054 (SC-001/002/005) load/concurrency regression test.
 *
 * This drives ~20 concurrent (speaker, listener) sessions through
 * TranslationManagerService with mocked Google STT/Translation and LiveKit
 * dependencies. The simulated per-call delays below stand in for the
 * external Speech-to-Text/Translation/LiveKit round-trips (not measured
 * here); the assertions instead guard the manager's own fan-out logic
 * against regressions that would serialize work across pipelines or
 * targets (e.g. an accidental `await` inside the per-target loop), which
 * would multiply latency by the number of concurrent sessions.
 *
 * A full latency measurement against live GCP/LiveKit infrastructure is
 * out of scope for this harness — see quickstart.md steps 4.1-4.7 (T053).
 */

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

/** Simulated Google Translation API round-trip for interim/final results. */
const INTERIM_DELAY_MS = 80;
const FINAL_DELAY_MS = 150;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 95th percentile of a list of millisecond durations. */
function p95(durations: number[]): number {
  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1,
  );
  return sorted[index];
}

describe('TranslationManagerService load/concurrency (T054, SC-001/002/005)', () => {
  const SPEAKER_COUNT = 5;
  const TARGET_LANGUAGES = ['es', 'fr', 'de', 'ar'];
  const SESSION_COUNT = SPEAKER_COUNT * TARGET_LANGUAGES.length; // 20

  let service: TranslationManagerService;
  let speechPipelineService: { open: jest.Mock; close: jest.Mock };
  let translationStateService: {
    addSubscriber: jest.Mock;
    removeSubscriber: jest.Mock;
    getRefCount: jest.Mock;
    acquireOwnership: jest.Mock;
    releaseOwnership: jest.Mock;
    deleteSubscriptions: jest.Mock;
  };
  let translationService: {
    translateFinal: jest.Mock;
    scheduleInterimTranslation: jest.Mock;
    clearPending: jest.Mock;
  };
  let captionDispatchService: { dispatch: jest.Mock };
  let speakerLanguageCache: { clear: jest.Mock };
  let usersRepository: { getTranslationBalanceSeconds: jest.Mock };
  let billingTickerService: {
    hasSession: jest.Mock;
    start: jest.Mock;
    stop: jest.Mock;
    updateTargetLanguage: jest.Mock;
    recordCaption: jest.Mock;
  };

  /** Captures the STT callbacks registered for each speaker's pipeline. */
  let callbacksBySpeaker: Map<string, SpeechPipelineCallbacks>;
  /** `transcriptStart.get(speakerId)` is the timestamp the simulated transcript was emitted. */
  let transcriptStart: Map<string, number>;
  let interimLatencies: number[];
  let finalLatencies: number[];

  beforeEach(async () => {
    callbacksBySpeaker = new Map();
    transcriptStart = new Map();
    interimLatencies = [];
    finalLatencies = [];

    speechPipelineService = {
      open: jest
        .fn()
        .mockImplementation(
          (
            roomId: string,
            speakerId: string,
            callbacks: SpeechPipelineCallbacks,
          ) => {
            callbacksBySpeaker.set(speakerId, callbacks);
            return Promise.resolve({
              livekitRoom: {},
            } as unknown as OpenPipelineHandle);
          },
        ),
      close: jest.fn().mockResolvedValue(undefined),
    };
    translationStateService = {
      addSubscriber: jest.fn().mockResolvedValue(1),
      removeSubscriber: jest.fn().mockResolvedValue(0),
      getRefCount: jest.fn().mockResolvedValue(0),
      acquireOwnership: jest.fn().mockResolvedValue(true),
      releaseOwnership: jest.fn().mockResolvedValue(undefined),
      deleteSubscriptions: jest.fn().mockResolvedValue(undefined),
    };
    translationService = {
      translateFinal: jest.fn().mockImplementation(
        (key: string, text: string, targetLanguage: string) =>
          new Promise<TranslationResult>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  text: `${text}-${targetLanguage}`,
                  targetLanguage,
                }),
              FINAL_DELAY_MS,
            ),
          ),
      ),
      scheduleInterimTranslation: jest
        .fn()
        .mockImplementation(
          (
            key: string,
            text: string,
            targetLanguage: string,
            _sourceLanguage: string,
            callback: (translated: TranslationResult) => void,
          ) => {
            setTimeout(
              () =>
                callback({ text: `${text}-${targetLanguage}`, targetLanguage }),
              INTERIM_DELAY_MS,
            );
          },
        ),
      clearPending: jest.fn(),
    };
    captionDispatchService = {
      dispatch: jest.fn().mockImplementation((input: DispatchCaptionInput) => {
        const startedAt = transcriptStart.get(input.speakerId);
        if (startedAt !== undefined) {
          const latency = Date.now() - startedAt;
          (input.type === 'interim' ? interimLatencies : finalLatencies).push(
            latency,
          );
        }
        return Promise.resolve();
      }),
    };
    speakerLanguageCache = { clear: jest.fn() };
    usersRepository = {
      getTranslationBalanceSeconds: jest.fn().mockResolvedValue(1_000),
    };
    billingTickerService = {
      hasSession: jest.fn().mockReturnValue(false),
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      updateTargetLanguage: jest.fn(),
      recordCaption: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationManagerService,
        { provide: SpeechPipelineService, useValue: speechPipelineService },
        { provide: TranslationStateService, useValue: translationStateService },
        { provide: TranslationService, useValue: translationService },
        { provide: CaptionDispatchService, useValue: captionDispatchService },
        { provide: SpeakerLanguageCache, useValue: speakerLanguageCache },
        { provide: UsersRepository, useValue: usersRepository },
        { provide: BillingTickerService, useValue: billingTickerService },
        { provide: TRANSLATION_CONFIG, useValue: config },
      ],
    }).compile();

    service = module.get(TranslationManagerService);
  });

  it('opens exactly one recognition stream per distinct speaker for 20 concurrent (speaker, listener) sessions (SC-005)', async () => {
    const subscriptions = [];
    for (let s = 0; s < SPEAKER_COUNT; s++) {
      for (const targetLanguage of TARGET_LANGUAGES) {
        subscriptions.push(
          service.subscribe(
            `room${s}`,
            `speaker${s}`,
            `listener-${s}-${targetLanguage}`,
            targetLanguage,
          ),
        );
      }
    }

    const results = await Promise.all(subscriptions);

    expect(results).toHaveLength(SESSION_COUNT);
    expect(results.every((r) => r.status === 'subscribed')).toBe(true);
    // One STT recognition stream per distinct speaker, regardless of how many
    // (listener, targetLanguage) branches it feeds.
    expect(speechPipelineService.open).toHaveBeenCalledTimes(SPEAKER_COUNT);
  });

  it('keeps interim caption latency p95 < 1s and final caption latency p95 < 2s under 20 concurrent sessions (SC-001, SC-002)', async () => {
    const subscriptions = [];
    for (let s = 0; s < SPEAKER_COUNT; s++) {
      for (const targetLanguage of TARGET_LANGUAGES) {
        subscriptions.push(
          service.subscribe(
            `room${s}`,
            `speaker${s}`,
            `listener-${s}-${targetLanguage}`,
            targetLanguage,
          ),
        );
      }
    }
    await Promise.all(subscriptions);

    // Every speaker's pipeline emits an interim transcript concurrently,
    // fanning out to its 4 target-language branches (20 dispatches total).
    for (let s = 0; s < SPEAKER_COUNT; s++) {
      const speakerId = `speaker${s}`;
      transcriptStart.set(speakerId, Date.now());
      callbacksBySpeaker.get(speakerId)!.onTranscript({
        text: 'Hel',
        isFinal: false,
        sourceLanguage: 'en-US',
      });
    }
    await delay(INTERIM_DELAY_MS + 100);

    expect(interimLatencies).toHaveLength(SESSION_COUNT);
    const interimP95 = p95(interimLatencies);

    console.log(
      `[T054] interim caption latency: p95=${interimP95}ms across ${interimLatencies.length} sessions`,
    );
    expect(interimP95).toBeLessThan(1_000);

    // Now every pipeline emits the final transcript for the same segment.
    for (let s = 0; s < SPEAKER_COUNT; s++) {
      const speakerId = `speaker${s}`;
      transcriptStart.set(speakerId, Date.now());
      callbacksBySpeaker.get(speakerId)!.onTranscript({
        text: 'Hello',
        isFinal: true,
        sourceLanguage: 'en-US',
      });
    }
    await delay(FINAL_DELAY_MS + 100);

    expect(finalLatencies).toHaveLength(SESSION_COUNT);
    const finalP95 = p95(finalLatencies);

    console.log(
      `[T054] final caption latency: p95=${finalP95}ms across ${finalLatencies.length} sessions`,
    );
    expect(finalP95).toBeLessThan(2_000);
  });
});
