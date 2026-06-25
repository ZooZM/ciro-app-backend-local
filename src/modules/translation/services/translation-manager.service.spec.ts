import { Test, TestingModule } from '@nestjs/testing';
import { TranslationManagerService } from './translation-manager.service';
import {
  SpeechPipelineService,
  type SpeechPipelineCallbacks,
  type OpenPipelineHandle,
} from './speech-pipeline.service';
import { TranslationStateService } from './translation-state.service';
import { TranslationService } from './translation.service';
import { CaptionDispatchService } from './caption-dispatch.service';
import { SpeakerLanguageCache } from './language-detection.util';
import { UsersRepository } from '../../users/users.repository';
import {
  BillingTickerService,
  type BillingSessionParams,
  type BillingTickerCallbacks,
} from './billing-ticker.service';
import { TranslationUsageEndReason } from '../schemas/translation-usage.schema';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

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

describe('TranslationManagerService', () => {
  let service: TranslationManagerService;
  let speechPipelineService: {
    open: jest.Mock<
      Promise<OpenPipelineHandle>,
      [string, string, SpeechPipelineCallbacks]
    >;
    close: jest.Mock;
  };
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
    start: jest.Mock<
      Promise<void>,
      [BillingSessionParams, BillingTickerCallbacks]
    >;
    stop: jest.Mock;
    updateTargetLanguage: jest.Mock;
    recordCaption: jest.Mock;
  };

  beforeEach(async () => {
    speechPipelineService = {
      open: jest
        .fn<
          Promise<OpenPipelineHandle>,
          [string, string, SpeechPipelineCallbacks]
        >()
        .mockResolvedValue({
          livekitRoom: {},
        } as unknown as OpenPipelineHandle),
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
      translateFinal: jest
        .fn()
        .mockResolvedValue({ text: 'hola', targetLanguage: 'es' }),
      scheduleInterimTranslation: jest.fn(),
      clearPending: jest.fn(),
    };
    captionDispatchService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    speakerLanguageCache = { clear: jest.fn() };
    usersRepository = {
      getTranslationBalanceSeconds: jest.fn().mockResolvedValue(120),
    };
    billingTickerService = {
      hasSession: jest.fn().mockReturnValue(false),
      start: jest
        .fn<Promise<void>, [BillingSessionParams, BillingTickerCallbacks]>()
        .mockResolvedValue(undefined),
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

  function pipelineCallbacks(): SpeechPipelineCallbacks {
    return speechPipelineService.open.mock.calls[0][2];
  }

  it('opens exactly one pipeline for the first subscriber and reuses it for a second listener (FR-008, FR-010)', async () => {
    const first = await service.subscribe(
      'room1',
      'speakerA',
      'listener1',
      'es',
    );
    expect(first).toEqual({
      status: 'subscribed',
      targetLanguage: 'es',
      remainingSeconds: 120,
    });
    expect(speechPipelineService.open).toHaveBeenCalledTimes(1);
    expect(translationStateService.addSubscriber).toHaveBeenCalledWith(
      'room1',
      'speakerA',
      'listener1',
      'es',
    );

    const second = await service.subscribe(
      'room1',
      'speakerA',
      'listener2',
      'fr',
    );
    expect(second).toEqual({
      status: 'subscribed',
      targetLanguage: 'fr',
      remainingSeconds: 120,
    });
    expect(speechPipelineService.open).toHaveBeenCalledTimes(1);
  });

  it('translates and dispatches a final transcript to the subscribed listener', async () => {
    await service.subscribe('room1', 'speakerA', 'listener1', 'es');

    pipelineCallbacks().onTranscript({
      text: 'Hello',
      isFinal: true,
      sourceLanguage: 'en-US',
    });
    await flushPromises();

    expect(translationService.translateFinal).toHaveBeenCalledWith(
      'room1:speakerA:es',
      'Hello',
      'es',
      'en-US',
    );
    expect(captionDispatchService.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        listenerIdentities: ['listener1'],
        speakerId: 'speakerA',
        sourceLanguage: 'en-US',
        targetLanguage: 'es',
        text: 'hola',
        type: 'final',
      }),
    );
  });

  it('defers captions for a listener who subscribes mid-segment until the next segment (FR-016)', async () => {
    await service.subscribe('room1', 'speakerA', 'listener1', 'es');
    const callbacks = pipelineCallbacks();

    // Segment is in-flight (interim) when a second listener subscribes.
    callbacks.onTranscript({
      text: 'Hel',
      isFinal: false,
      sourceLanguage: 'en-US',
    });
    await service.subscribe('room1', 'speakerA', 'listener2', 'fr');

    // Still mid-segment: only the already-active 'es' target translates.
    callbacks.onTranscript({
      text: 'Hello',
      isFinal: false,
      sourceLanguage: 'en-US',
    });
    expect(translationService.scheduleInterimTranslation).toHaveBeenCalledTimes(
      2,
    );
    expect(translationService.scheduleInterimTranslation).toHaveBeenCalledWith(
      'room1:speakerA:es',
      'Hello',
      'es',
      'en-US',
      expect.any(Function),
    );

    // Segment finalizes: 'fr' (listener2) is still excluded from this segment's final.
    callbacks.onTranscript({
      text: 'Hello there',
      isFinal: true,
      sourceLanguage: 'en-US',
    });
    await flushPromises();
    expect(translationService.translateFinal).toHaveBeenCalledTimes(1);
    expect(translationService.translateFinal).toHaveBeenCalledWith(
      'room1:speakerA:es',
      'Hello there',
      'es',
      'en-US',
    );

    // Next segment: listener2's 'fr' target is now active.
    translationService.translateFinal.mockClear();
    callbacks.onTranscript({
      text: 'New segment',
      isFinal: true,
      sourceLanguage: 'en-US',
    });
    await flushPromises();
    expect(translationService.translateFinal).toHaveBeenCalledWith(
      'room1:speakerA:fr',
      'New segment',
      'fr',
      'en-US',
    );
  });

  it('notifies subscribed listeners and tears down the pipeline on a pipeline failure (FR-014, SC-010)', async () => {
    await service.subscribe('room1', 'speakerA', 'listener1', 'es');
    const callbacks = pipelineCallbacks();

    const eventHandler = { onTranslationUnavailable: jest.fn() };
    service.setEventHandler(eventHandler);

    callbacks.onError('service_outage');
    await flushPromises();

    expect(eventHandler.onTranslationUnavailable).toHaveBeenCalledWith(
      'listener1',
      {
        roomId: 'room1',
        speakerId: 'speakerA',
        reason: 'service_outage',
        transient: true,
      },
    );
    expect(speechPipelineService.close).toHaveBeenCalledTimes(1);
    expect(translationStateService.deleteSubscriptions).toHaveBeenCalledWith(
      'room1',
      'speakerA',
    );

    // Pipeline was torn down — a fresh subscribe opens a new one.
    await service.subscribe('room1', 'speakerA', 'listener1', 'es');
    expect(speechPipelineService.open).toHaveBeenCalledTimes(2);
  });

  describe('idle teardown (FR-009, T029/T030/T035)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('tears down the pipeline after the idle grace window once the last subscriber unsubscribes', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');

      await service.unsubscribe('room1', 'speakerA', 'listener1');

      expect(speechPipelineService.close).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(config.idleGraceMs);

      expect(speechPipelineService.close).toHaveBeenCalledWith(
        'room1',
        'speakerA',
      );
      expect(translationStateService.deleteSubscriptions).toHaveBeenCalledWith(
        'room1',
        'speakerA',
      );
      expect(translationStateService.releaseOwnership).toHaveBeenCalled();
      expect(speakerLanguageCache.clear).toHaveBeenCalledWith(
        'room1',
        'speakerA',
      );
    });

    it('cancels the pending teardown if a listener re-subscribes within the grace window', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');

      await service.unsubscribe('room1', 'speakerA', 'listener1');

      translationStateService.addSubscriber.mockResolvedValue(1);
      await service.subscribe('room1', 'speakerA', 'listener2', 'fr');

      await jest.advanceTimersByTimeAsync(config.idleGraceMs);

      expect(speechPipelineService.close).not.toHaveBeenCalled();
      expect(speechPipelineService.open).toHaveBeenCalledTimes(1);
    });

    it('does not tear down if the refcount is no longer zero when the grace timer fires', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');

      await service.unsubscribe('room1', 'speakerA', 'listener1');

      translationStateService.getRefCount.mockResolvedValue(1);
      await jest.advanceTimersByTimeAsync(config.idleGraceMs);

      expect(speechPipelineService.close).not.toHaveBeenCalled();
    });
  });

  describe('billing integration (US4, T037/T042)', () => {
    it('denies activation with insufficient_credits when balance is below the activation minimum (FR-021, SC-011)', async () => {
      usersRepository.getTranslationBalanceSeconds.mockResolvedValue(0);

      const result = await service.subscribe(
        'room1',
        'speakerA',
        'listener1',
        'es',
      );

      expect(result).toEqual({
        status: 'denied',
        reason: 'insufficient_credits',
      });
      expect(translationStateService.addSubscriber).not.toHaveBeenCalled();
      expect(speechPipelineService.open).not.toHaveBeenCalled();
      expect(billingTickerService.start).not.toHaveBeenCalled();
    });

    it('starts a billing session on successful subscribe', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');

      expect(billingTickerService.start).toHaveBeenCalledWith(
        {
          listenerId: 'listener1',
          roomId: 'room1',
          speakerId: 'speakerA',
          targetLanguage: 'es',
          initialBalanceSeconds: 120,
        },
        expect.objectContaining({
          onCreditsLow: expect.any(Function) as unknown as () => void,
          onExhausted: expect.any(Function) as unknown as () => void,
        }),
      );
    });

    it('updates the billed target language instead of starting a new session on a language change', async () => {
      billingTickerService.hasSession.mockReturnValue(true);

      await service.subscribe('room1', 'speakerA', 'listener1', 'fr');

      expect(billingTickerService.start).not.toHaveBeenCalled();
      expect(billingTickerService.updateTargetLanguage).toHaveBeenCalledWith(
        'room1',
        'speakerA',
        'listener1',
        'fr',
      );
    });

    it('stops the billing session with USER_UNSUBSCRIBED on explicit unsubscribe', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');

      await service.unsubscribe('room1', 'speakerA', 'listener1');

      expect(billingTickerService.stop).toHaveBeenCalledWith(
        'room1',
        'speakerA',
        'listener1',
        TranslationUsageEndReason.USER_UNSUBSCRIBED,
      );
    });

    it('relays credits_low via the event handler (FR-024a, SC-015)', async () => {
      const eventHandler = {
        onTranslationUnavailable: jest.fn(),
        onCreditsLow: jest.fn(),
        onCreditsExhausted: jest.fn(),
      };
      service.setEventHandler(eventHandler);

      await service.subscribe('room1', 'speakerA', 'listener1', 'es');
      const { onCreditsLow } = billingTickerService.start.mock.calls[0][1];
      onCreditsLow(30);

      expect(eventHandler.onCreditsLow).toHaveBeenCalledWith('listener1', {
        roomId: 'room1',
        speakerId: 'speakerA',
        remainingSeconds: 30,
        thresholdSeconds: config.lowBalanceSeconds,
      });
    });

    it("closes only the exhausted listener's branch and emits credits_exhausted (FR-023, FR-024, FR-025, SC-012)", async () => {
      const eventHandler = {
        onTranslationUnavailable: jest.fn(),
        onCreditsLow: jest.fn(),
        onCreditsExhausted: jest.fn(),
      };
      service.setEventHandler(eventHandler);

      await service.subscribe('room1', 'speakerA', 'listener1', 'es');
      const { onExhausted } = billingTickerService.start.mock.calls[0][1];

      onExhausted();
      await flushPromises();

      expect(billingTickerService.stop).toHaveBeenCalledWith(
        'room1',
        'speakerA',
        'listener1',
        TranslationUsageEndReason.CREDITS_EXHAUSTED,
      );
      expect(eventHandler.onCreditsExhausted).toHaveBeenCalledWith(
        'listener1',
        {
          roomId: 'room1',
          speakerId: 'speakerA',
          remainingSeconds: 0,
          action: 'branch_closed',
        },
      );
    });

    it("records dispatched captions against the listener's billing session (FR-018)", async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');

      pipelineCallbacks().onTranscript({
        text: 'Hello',
        isFinal: true,
        sourceLanguage: 'en-US',
      });
      await flushPromises();

      expect(billingTickerService.recordCaption).toHaveBeenCalledWith(
        'room1',
        'speakerA',
        'listener1',
        'final',
        'en-US',
      );
    });
  });

  describe('multi-target translation (US3, T044-T047)', () => {
    it('shares one translation branch for two listeners on the same target language (FR-011, SC-005)', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');
      await service.subscribe('room1', 'speakerA', 'listener2', 'es');

      pipelineCallbacks().onTranscript({
        text: 'Hello',
        isFinal: true,
        sourceLanguage: 'en-US',
      });
      await flushPromises();

      expect(translationService.translateFinal).toHaveBeenCalledTimes(1);
      expect(translationService.translateFinal).toHaveBeenCalledWith(
        'room1:speakerA:es',
        'Hello',
        'es',
        'en-US',
      );
      expect(captionDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          listenerIdentities: ['listener1', 'listener2'],
        }),
      );
    });

    it('delivers each target language only to its own listeners, never the other language (FR-006, SC-009)', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');
      await service.subscribe('room1', 'speakerA', 'listener2', 'fr');

      pipelineCallbacks().onTranscript({
        text: 'Hello',
        isFinal: true,
        sourceLanguage: 'en-US',
      });
      await flushPromises();

      expect(translationService.translateFinal).toHaveBeenCalledTimes(2);
      expect(translationService.translateFinal).toHaveBeenCalledWith(
        'room1:speakerA:es',
        'Hello',
        'es',
        'en-US',
      );
      expect(translationService.translateFinal).toHaveBeenCalledWith(
        'room1:speakerA:fr',
        'Hello',
        'fr',
        'en-US',
      );
      expect(captionDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ listenerIdentities: ['listener1'] }),
      );
      expect(captionDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ listenerIdentities: ['listener2'] }),
      );
    });

    it('translation:changeLanguage re-points only the caller and drops the now-empty old target (FR-002, FR-011)', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');
      await service.subscribe('room1', 'speakerA', 'listener2', 'fr');

      // listener1 changes from 'es' to 'fr'; 'es' has no listeners left afterwards.
      await service.subscribe('room1', 'speakerA', 'listener1', 'fr');

      expect(translationService.clearPending).toHaveBeenCalledWith(
        'room1:speakerA:es',
      );

      pipelineCallbacks().onTranscript({
        text: 'Hello',
        isFinal: true,
        sourceLanguage: 'en-US',
      });
      await flushPromises();

      expect(translationService.translateFinal).toHaveBeenCalledTimes(1);
      expect(translationService.translateFinal).toHaveBeenCalledWith(
        'room1:speakerA:fr',
        'Hello',
        'fr',
        'en-US',
      );
      expect(captionDispatchService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          listenerIdentities: ['listener2', 'listener1'],
        }),
      );
    });

    it('drops an emptied target on unsubscribe and clears its translation throttle state', async () => {
      await service.subscribe('room1', 'speakerA', 'listener1', 'es');
      await service.subscribe('room1', 'speakerA', 'listener2', 'fr');

      await service.unsubscribe('room1', 'speakerA', 'listener1');

      expect(translationService.clearPending).toHaveBeenCalledWith(
        'room1:speakerA:es',
      );

      pipelineCallbacks().onTranscript({
        text: 'Hello',
        isFinal: true,
        sourceLanguage: 'en-US',
      });
      await flushPromises();

      expect(translationService.translateFinal).toHaveBeenCalledTimes(1);
      expect(translationService.translateFinal).toHaveBeenCalledWith(
        'room1:speakerA:fr',
        'Hello',
        'fr',
        'en-US',
      );
    });
  });
});
