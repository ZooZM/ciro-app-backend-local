import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Room } from '@livekit/rtc-node';
import { UsersRepository } from '../../users/users.repository';
import { TranslationStateService } from './translation-state.service';
import { TranslationService } from './translation.service';
import {
  CaptionDispatchService,
  CaptionType,
} from './caption-dispatch.service';
import { SpeakerLanguageCache } from './language-detection.util';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';
import { TranslationUsageEndReason } from '../schemas/translation-usage.schema';
import { BillingTickerService } from './billing-ticker.service';
import {
  SpeechPipelineService,
  type PipelineFailureReason,
  type SpeechPipelineCallbacks,
  type TranscriptResult,
} from './speech-pipeline.service';

/** A target language being translated for one or more listeners on a single pipeline. */
interface TargetState {
  /** Listeners actively receiving captions for this target language. */
  listenerIds: Set<string>;
  /** Listeners who subscribed mid-segment; activated once the in-flight segment finalizes (FR-016). */
  pendingListenerIds: Set<string>;
}

/** In-process pipeline state for a (room, speaker) this instance owns (data-model.md §3). */
interface ActivePipeline {
  roomId: string;
  speakerId: string;
  livekitRoom: Room;
  /** Locked detected language for the in-flight segment, or `null` between segments (R2). */
  segmentLanguage: string | null;
  /** Identifier shared by all interim/final captions belonging to the in-flight segment. */
  segmentId: string;
  /** Monotonically increasing sequence number for dispatched captions (contracts/caption-data-channel.md). */
  seq: number;
  targets: Map<string, TargetState>;
  /** Pending teardown timer while refcount is 0; cancelled if a new subscriber arrives (FR-009). */
  graceTimer?: NodeJS.Timeout;
}

/** Mirrors the `translation:denied.reason` enum (contracts/socket-events.md, FR-014/FR-021). */
export type SubscribeDeniedReason =
  | 'unsupported_language'
  | 'insufficient_credits';

export interface TranslationUnavailableEvent {
  roomId: string;
  speakerId: string;
  reason: PipelineFailureReason;
  transient: boolean;
}

/** FR-024a/SC-015: emitted at most once per session when the balance first crosses the threshold. */
export interface CreditsLowEvent {
  roomId: string;
  speakerId: string;
  remainingSeconds: number;
  thresholdSeconds: number;
}

/** FR-023/FR-024/SC-012: emitted when a listener's branch is closed due to balance exhaustion. */
export interface CreditsExhaustedEvent {
  roomId: string;
  speakerId: string;
  remainingSeconds: 0;
  action: 'branch_closed';
}

export type SubscribeResult =
  | { status: 'subscribed'; targetLanguage: string; remainingSeconds: number }
  | { status: 'denied'; reason: SubscribeDeniedReason }
  | {
      status: 'unavailable';
      reason: PipelineFailureReason;
      transient: boolean;
    };

/** Receives out-of-band notifications the manager cannot deliver itself (no Socket.IO server reference). */
export interface TranslationManagerEventHandler {
  onTranslationUnavailable(
    listenerId: string,
    event: TranslationUnavailableEvent,
  ): void;
  onCreditsLow(listenerId: string, event: CreditsLowEvent): void;
  onCreditsExhausted(listenerId: string, event: CreditsExhaustedEvent): void;
}

/**
 * Owns active translation pipelines for (room, speaker) pairs hosted on this instance
 * (v1 pinned-worker stance, T015a). `subscribe` opens a pipeline on the first listener
 * and reuses it for subsequent listeners (FR-008, FR-010); each pipeline runs exactly
 * one Speech-to-Text stream regardless of how many target languages are active.
 */
@Injectable()
export class TranslationManagerService {
  private readonly logger = new Logger(TranslationManagerService.name);
  private readonly instanceId = randomUUID();
  private readonly pipelines = new Map<string, ActivePipeline>();
  /** In-flight `openPipeline` calls keyed by pipeline key (T054): lets concurrent
   *  subscribers for the same (room, speaker) await one pipeline open instead of
   *  each racing to open their own (SC-005). */
  private readonly pipelineOpens = new Map<string, Promise<ActivePipeline>>();
  private eventHandler?: TranslationManagerEventHandler;

  constructor(
    private readonly speechPipelineService: SpeechPipelineService,
    private readonly translationStateService: TranslationStateService,
    private readonly translationService: TranslationService,
    private readonly captionDispatchService: CaptionDispatchService,
    private readonly speakerLanguageCache: SpeakerLanguageCache,
    private readonly usersRepository: UsersRepository,
    private readonly billingTickerService: BillingTickerService,
    @Inject(TRANSLATION_CONFIG) private readonly config: TranslationConfig,
  ) {}

  /** Registers the gateway (or other consumer) to receive async availability notifications. */
  setEventHandler(handler: TranslationManagerEventHandler): void {
    this.eventHandler = handler;
  }

  private pipelineKey(roomId: string, speakerId: string): string {
    return `${roomId}:${speakerId}`;
  }

  private translationKey(
    roomId: string,
    speakerId: string,
    targetLanguage: string,
  ): string {
    return `${roomId}:${speakerId}:${targetLanguage}`;
  }

  /**
   * Subscribes `listenerId` to live translated captions for `speakerId` in `targetLanguage`
   * (FR-002, FR-008). Opens a new pipeline on the first subscriber for a (room, speaker);
   * subsequent subscribers register an additional target language on the existing pipeline.
   */
  async subscribe(
    roomId: string,
    speakerId: string,
    listenerId: string,
    targetLanguage: string,
  ): Promise<SubscribeResult> {
    const remainingSeconds =
      await this.usersRepository.getTranslationBalanceSeconds(listenerId);

    // FR-021/SC-011: deny activation before opening any stream when balance is insufficient.
    if (remainingSeconds < this.config.activationMinSeconds) {
      return { status: 'denied', reason: 'insufficient_credits' };
    }

    await this.translationStateService.addSubscriber(
      roomId,
      speakerId,
      listenerId,
      targetLanguage,
    );

    const key = this.pipelineKey(roomId, speakerId);
    let pipeline = this.pipelines.get(key);

    if (!pipeline) {
      try {
        pipeline = await this.getOrOpenPipeline(key, roomId, speakerId);
      } catch (error) {
        this.logger.error(
          `Failed to open pipeline for ${key}: ${(error as Error).message}`,
        );
        await this.translationStateService.removeSubscriber(
          roomId,
          speakerId,
          listenerId,
        );
        return {
          status: 'unavailable',
          reason: 'service_outage',
          transient: true,
        };
      }
    } else if (pipeline.graceTimer) {
      // FR-009: a re-subscribe within the grace window cancels the pending teardown.
      clearTimeout(pipeline.graceTimer);
      pipeline.graceTimer = undefined;
    }

    this.addListenerToTarget(pipeline, listenerId, targetLanguage);

    if (this.billingTickerService.hasSession(roomId, speakerId, listenerId)) {
      this.billingTickerService.updateTargetLanguage(
        roomId,
        speakerId,
        listenerId,
        targetLanguage,
      );
    } else {
      await this.billingTickerService.start(
        {
          listenerId,
          roomId,
          speakerId,
          targetLanguage,
          initialBalanceSeconds: remainingSeconds,
        },
        {
          onCreditsLow: (remaining) => {
            this.eventHandler?.onCreditsLow(listenerId, {
              roomId,
              speakerId,
              remainingSeconds: remaining,
              thresholdSeconds: this.config.lowBalanceSeconds,
            });
          },
          onExhausted: () => {
            void this.handleCreditsExhausted(roomId, speakerId, listenerId);
          },
        },
      );
    }

    return { status: 'subscribed', targetLanguage, remainingSeconds };
  }

  /** FR-023/FR-024/SC-012: closes only the exhausted listener's branch and notifies their client. */
  private async handleCreditsExhausted(
    roomId: string,
    speakerId: string,
    listenerId: string,
  ): Promise<void> {
    await this.unsubscribe(
      roomId,
      speakerId,
      listenerId,
      TranslationUsageEndReason.CREDITS_EXHAUSTED,
    );

    this.eventHandler?.onCreditsExhausted(listenerId, {
      roomId,
      speakerId,
      remainingSeconds: 0,
      action: 'branch_closed',
    });
  }

  /**
   * Removes `listenerId`'s subscription to `speakerId` in `roomId` (FR-009). If this was
   * the last subscriber, schedules pipeline teardown after `idleGraceMs`. Idempotent.
   */
  async unsubscribe(
    roomId: string,
    speakerId: string,
    listenerId: string,
    endReason: TranslationUsageEndReason = TranslationUsageEndReason.USER_UNSUBSCRIBED,
  ): Promise<void> {
    const key = this.pipelineKey(roomId, speakerId);
    const pipeline = this.pipelines.get(key);
    if (pipeline) {
      this.removeListenerFromPipeline(pipeline, listenerId);
    }

    await this.billingTickerService.stop(
      roomId,
      speakerId,
      listenerId,
      endReason,
    );

    const refCount = await this.translationStateService.removeSubscriber(
      roomId,
      speakerId,
      listenerId,
    );

    if (refCount === 0 && pipeline) {
      this.scheduleTeardown(pipeline);
    }
  }

  /** Removes `listenerId` from every target on the pipeline (active or pending), dropping any target left with no listeners. */
  private removeListenerFromPipeline(
    pipeline: ActivePipeline,
    listenerId: string,
  ): void {
    for (const [language, target] of pipeline.targets) {
      target.listenerIds.delete(listenerId);
      target.pendingListenerIds.delete(listenerId);
      this.dropTargetIfEmpty(pipeline, language, target);
    }
  }

  /** Removes an emptied target (FR-011) and clears its translation throttle state. */
  private dropTargetIfEmpty(
    pipeline: ActivePipeline,
    targetLanguage: string,
    target: TargetState,
  ): void {
    if (target.listenerIds.size > 0 || target.pendingListenerIds.size > 0) {
      return;
    }
    pipeline.targets.delete(targetLanguage);
    this.translationService.clearPending(
      this.translationKey(pipeline.roomId, pipeline.speakerId, targetLanguage),
    );
  }

  /** Starts (or restarts) the idle-teardown grace timer (FR-009). */
  private scheduleTeardown(pipeline: ActivePipeline): void {
    if (pipeline.graceTimer) clearTimeout(pipeline.graceTimer);
    pipeline.graceTimer = setTimeout(() => {
      void this.completeTeardownIfIdle(pipeline);
    }, this.config.idleGraceMs);
  }

  /** Fires after the grace window: tears down the pipeline only if still idle. */
  private async completeTeardownIfIdle(
    pipeline: ActivePipeline,
  ): Promise<void> {
    pipeline.graceTimer = undefined;

    const refCount = await this.translationStateService.getRefCount(
      pipeline.roomId,
      pipeline.speakerId,
    );
    if (refCount > 0) return;

    await this.teardownPipeline(pipeline);
  }

  /**
   * Returns the pipeline for `key`, opening it if needed. Concurrent callers for the
   * same key (e.g. several listeners subscribing to the same speaker in one tick)
   * share a single in-flight `openPipeline` call rather than each opening their own
   * recognition stream (T054, SC-005).
   */
  private getOrOpenPipeline(
    key: string,
    roomId: string,
    speakerId: string,
  ): Promise<ActivePipeline> {
    let openPromise = this.pipelineOpens.get(key);
    if (!openPromise) {
      openPromise = this.openPipeline(roomId, speakerId);
      this.pipelineOpens.set(key, openPromise);
      void openPromise.then(
        () => this.pipelineOpens.delete(key),
        () => this.pipelineOpens.delete(key),
      );
    }
    return openPromise;
  }

  /** Opens a new pipeline for (room, speaker), acquiring the v1 pinned-worker ownership lock. */
  private async openPipeline(
    roomId: string,
    speakerId: string,
  ): Promise<ActivePipeline> {
    const acquired = await this.translationStateService.acquireOwnership(
      roomId,
      speakerId,
      this.instanceId,
    );
    if (!acquired) {
      // v1 pinned-worker stance (T015a): cross-instance pipeline distribution is deferred,
      // so a single instance is expected to hold every lock. Proceed locally regardless.
      this.logger.warn(
        `Ownership lock for ${roomId}/${speakerId} already held; proceeding locally`,
      );
    }

    const ref: { current?: ActivePipeline } = {};
    const callbacks: SpeechPipelineCallbacks = {
      onTranscript: (result) => {
        if (ref.current) this.handleTranscript(ref.current, result);
      },
      onError: (reason) => {
        if (ref.current) void this.handlePipelineError(ref.current, reason);
      },
    };

    const handle = await this.speechPipelineService.open(
      roomId,
      speakerId,
      callbacks,
    );

    const pipeline: ActivePipeline = {
      roomId,
      speakerId,
      livekitRoom: handle.livekitRoom,
      segmentLanguage: null,
      segmentId: randomUUID(),
      seq: 0,
      targets: new Map(),
    };
    ref.current = pipeline;

    this.pipelines.set(this.pipelineKey(roomId, speakerId), pipeline);
    return pipeline;
  }

  /**
   * Adds `listenerId` to `targetLanguage`, removing it from any other target on the
   * same pipeline. If a `translation:changeLanguage` empties the previous target,
   * that branch is dropped and its translation throttle state cleared (FR-002, FR-011).
   */
  private addListenerToTarget(
    pipeline: ActivePipeline,
    listenerId: string,
    targetLanguage: string,
  ): void {
    for (const [language, target] of pipeline.targets) {
      if (language === targetLanguage) continue;
      target.listenerIds.delete(listenerId);
      target.pendingListenerIds.delete(listenerId);
      this.dropTargetIfEmpty(pipeline, language, target);
    }

    let target = pipeline.targets.get(targetLanguage);
    if (!target) {
      target = { listenerIds: new Set(), pendingListenerIds: new Set() };
      pipeline.targets.set(targetLanguage, target);
    }

    // FR-016: a listener joining mid-segment starts receiving captions from the next segment.
    if (pipeline.segmentLanguage === null) {
      target.listenerIds.add(listenerId);
    } else {
      target.pendingListenerIds.add(listenerId);
    }
  }

  /** Routes one STT result through translation + caption dispatch for every active target language. */
  private handleTranscript(
    pipeline: ActivePipeline,
    result: TranscriptResult,
  ): void {
    const segmentId = pipeline.segmentId;
    pipeline.segmentLanguage = result.isFinal ? null : result.sourceLanguage;

    this.logger.debug(
      `[TRANSCRIPT] room=${pipeline.roomId} speaker=${pipeline.speakerId} isFinal=${result.isFinal} lang=${result.sourceLanguage} text="${result.text}" targets=${pipeline.targets.size}`,
    );

    for (const [targetLanguage, target] of pipeline.targets) {
      this.logger.debug(
        `[TRANSCRIPT] target=${targetLanguage} activeListeners=${target.listenerIds.size} pendingListeners=${target.pendingListenerIds.size}`,
      );
      if (target.listenerIds.size === 0) continue;

      const listenerIdentities = [...target.listenerIds];
      const key = this.translationKey(
        pipeline.roomId,
        pipeline.speakerId,
        targetLanguage,
      );

      if (result.isFinal) {
        this.translationService
          .translateFinal(
            key,
            result.text,
            targetLanguage,
            result.sourceLanguage,
          )
          .then((translated) =>
            this.dispatchCaption(
              pipeline,
              listenerIdentities,
              segmentId,
              'final',
              result.sourceLanguage,
              translated,
            ),
          )
          .catch((error: unknown) => {
            this.logger.error(
              `Final translation failed for ${key}: ${(error as Error).message}`,
            );
          });
      } else {
        this.translationService.scheduleInterimTranslation(
          key,
          result.text,
          targetLanguage,
          result.sourceLanguage,
          (translated) =>
            this.dispatchCaption(
              pipeline,
              listenerIdentities,
              segmentId,
              'interim',
              result.sourceLanguage,
              translated,
            ),
        );
      }
    }

    if (result.isFinal) {
      for (const target of pipeline.targets.values()) {
        for (const listenerId of target.pendingListenerIds) {
          target.listenerIds.add(listenerId);
        }
        target.pendingListenerIds.clear();
      }
      pipeline.segmentId = randomUUID();
    }
  }

  private dispatchCaption(
    pipeline: ActivePipeline,
    listenerIdentities: string[],
    segmentId: string,
    type: CaptionType,
    sourceLanguage: string,
    translated: { text: string; targetLanguage: string },
  ): void {
    pipeline.seq += 1;

    this.logger.debug(
      `[DISPATCH] room=${pipeline.roomId} speaker=${pipeline.speakerId} type=${type} targetLang=${translated.targetLanguage} listeners=${JSON.stringify(listenerIdentities)} text="${translated.text}"`,
    );

    for (const listenerId of listenerIdentities) {
      this.billingTickerService.recordCaption(
        pipeline.roomId,
        pipeline.speakerId,
        listenerId,
        type,
        sourceLanguage,
      );
    }

    void this.captionDispatchService
      .dispatch({
        room: pipeline.livekitRoom,
        listenerIdentities,
        speakerId: pipeline.speakerId,
        sourceLanguage,
        targetLanguage: translated.targetLanguage,
        text: translated.text,
        segmentId,
        seq: pipeline.seq,
        type,
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Caption dispatch failed for ${pipeline.roomId}/${pipeline.speakerId}: ${(error as Error).message}`,
        );
      });
  }

  /** FR-014/SC-010: notifies affected listeners and tears down the pipeline without touching call media. */
  private async handlePipelineError(
    pipeline: ActivePipeline,
    reason: PipelineFailureReason,
  ): Promise<void> {
    const key = this.pipelineKey(pipeline.roomId, pipeline.speakerId);
    if (this.pipelines.get(key) !== pipeline) return;

    const listenerIds = new Set<string>();
    for (const target of pipeline.targets.values()) {
      for (const id of target.listenerIds) listenerIds.add(id);
      for (const id of target.pendingListenerIds) listenerIds.add(id);
    }

    const event: TranslationUnavailableEvent = {
      roomId: pipeline.roomId,
      speakerId: pipeline.speakerId,
      reason,
      transient: reason === 'service_outage',
    };

    for (const listenerId of listenerIds) {
      this.eventHandler?.onTranslationUnavailable(listenerId, event);
      await this.billingTickerService.stop(
        pipeline.roomId,
        pipeline.speakerId,
        listenerId,
        TranslationUsageEndReason.SERVICE_ERROR,
      );
    }

    await this.teardownPipeline(pipeline);
  }

  /** Closes the STT stream(s), leaves the LiveKit room, and clears all in-memory/Redis state (T030). */
  private async teardownPipeline(pipeline: ActivePipeline): Promise<void> {
    const key = this.pipelineKey(pipeline.roomId, pipeline.speakerId);
    if (this.pipelines.get(key) !== pipeline) return;
    this.pipelines.delete(key);

    if (pipeline.graceTimer) {
      clearTimeout(pipeline.graceTimer);
      pipeline.graceTimer = undefined;
    }

    for (const targetLanguage of pipeline.targets.keys()) {
      this.translationService.clearPending(
        this.translationKey(
          pipeline.roomId,
          pipeline.speakerId,
          targetLanguage,
        ),
      );
    }
    this.speakerLanguageCache.clear(pipeline.roomId, pipeline.speakerId);

    await this.translationStateService.deleteSubscriptions(
      pipeline.roomId,
      pipeline.speakerId,
    );
    await this.translationStateService.releaseOwnership(
      pipeline.roomId,
      pipeline.speakerId,
      this.instanceId,
    );

    await this.speechPipelineService
      .close(pipeline.roomId, pipeline.speakerId)
      .catch((error: unknown) => {
        this.logger.error(
          `Pipeline teardown failed for ${key}: ${(error as Error).message}`,
        );
      });
  }
}
