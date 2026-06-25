import { Inject, Injectable, Logger } from '@nestjs/common';
import { TranslationStateService } from './translation-state.service';
import { UsersRepository } from '../../users/users.repository';
import { TranslationUsageRepository } from '../repositories/translation-usage.repository';
import { TranslationUsageEndReason } from '../schemas/translation-usage.schema';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';

/** How often the live Redis counter is reconciled into the authoritative DB balance (FR-026, SC-013). */
const DB_FLUSH_INTERVAL_SECONDS = 15;

export interface BillingSessionParams {
  listenerId: string;
  roomId: string;
  speakerId: string;
  targetLanguage: string;
  /** Listener's authoritative balance (seconds) at session start, used to seed the live counter. */
  initialBalanceSeconds: number;
}

export interface BillingTickerCallbacks {
  /** Fired exactly once per session, the first tick where remaining seconds <= the low-balance threshold (FR-024a, SC-015). */
  onCreditsLow: (remainingSeconds: number) => void;
  /** Fired once the live balance reaches 0; the manager closes this listener's branch (FR-023, FR-024). */
  onExhausted: () => void;
}

interface BillingSession {
  sessionId: string;
  listenerId: string;
  targetLanguage: string;
  secondsConsumed: number;
  lastFlushedSeconds: number;
  interimDelta: number;
  finalDelta: number;
  detectedSourceLanguages: Set<string>;
  ticker: NodeJS.Timeout;
  callbacks: BillingTickerCallbacks;
}

/**
 * Per-listener translation session ticker (FR-022, FR-026). One 1-second interval per
 * (room, speaker, listener) decrements a live Redis balance counter seeded from the
 * listener's DB balance, periodically reconciles it back to the DB, and signals
 * `credits_low` / exhaustion via the callbacks supplied at `start()`.
 */
@Injectable()
export class BillingTickerService {
  private readonly logger = new Logger(BillingTickerService.name);
  private readonly sessions = new Map<string, BillingSession>();
  /** Keys with a `start()` in flight, claimed synchronously to avoid a concurrent-activation race. */
  private readonly startingKeys = new Set<string>();

  constructor(
    private readonly translationStateService: TranslationStateService,
    private readonly usersRepository: UsersRepository,
    private readonly translationUsageRepository: TranslationUsageRepository,
    @Inject(TRANSLATION_CONFIG) private readonly config: TranslationConfig,
  ) {}

  private key(roomId: string, speakerId: string, listenerId: string): string {
    return `${roomId}:${speakerId}:${listenerId}`;
  }

  hasSession(roomId: string, speakerId: string, listenerId: string): boolean {
    return this.sessions.has(this.key(roomId, speakerId, listenerId));
  }

  /** Updates the billed target language after a `translation:changeLanguage` (no session restart). */
  updateTargetLanguage(
    roomId: string,
    speakerId: string,
    listenerId: string,
    targetLanguage: string,
  ): void {
    const session = this.sessions.get(this.key(roomId, speakerId, listenerId));
    if (session) session.targetLanguage = targetLanguage;
  }

  /** Records a dispatched caption for the session's usage counters (FR-018). */
  recordCaption(
    roomId: string,
    speakerId: string,
    listenerId: string,
    type: 'interim' | 'final',
    sourceLanguage: string,
  ): void {
    const session = this.sessions.get(this.key(roomId, speakerId, listenerId));
    if (!session) return;

    if (type === 'interim') session.interimDelta += 1;
    else session.finalDelta += 1;
    session.detectedSourceLanguages.add(sourceLanguage);
  }

  /**
   * Starts billing for a newly subscribed listener; a no-op if a session already exists
   * or is being created (claims `key` synchronously to avoid a concurrent-activation race).
   */
  async start(
    params: BillingSessionParams,
    callbacks: BillingTickerCallbacks,
  ): Promise<void> {
    const key = this.key(params.roomId, params.speakerId, params.listenerId);
    if (this.sessions.has(key) || this.startingKeys.has(key)) return;
    this.startingKeys.add(key);

    try {
      const usage = await this.translationUsageRepository.startSession({
        listenerId: params.listenerId,
        roomId: params.roomId,
        speakerId: params.speakerId,
        targetLanguage: params.targetLanguage,
      });
      const sessionId = usage._id.toString();

      await this.translationStateService.seedBalance(
        params.listenerId,
        sessionId,
        params.initialBalanceSeconds,
      );
      await this.translationStateService.clearLowBalanceFlag(sessionId);

      const session: BillingSession = {
        sessionId,
        listenerId: params.listenerId,
        targetLanguage: params.targetLanguage,
        secondsConsumed: 0,
        lastFlushedSeconds: 0,
        interimDelta: 0,
        finalDelta: 0,
        detectedSourceLanguages: new Set(),
        callbacks,
        ticker: setInterval(() => void this.tick(key), 1000),
      };
      this.sessions.set(key, session);
    } finally {
      this.startingKeys.delete(key);
    }
  }

  /** One second of consumption: decrement the live counter, check thresholds, flush periodically. */
  private async tick(key: string): Promise<void> {
    const session = this.sessions.get(key);
    if (!session) return;

    const remaining = await this.translationStateService.decrementBalance(
      session.listenerId,
      session.sessionId,
      1,
    );
    session.secondsConsumed += 1;

    if (remaining <= this.config.lowBalanceSeconds) {
      const firstTime =
        await this.translationStateService.markLowBalanceEmitted(
          session.sessionId,
        );
      if (firstTime) {
        session.callbacks.onCreditsLow(remaining);
      }
    }

    if (
      session.secondsConsumed - session.lastFlushedSeconds >=
      DB_FLUSH_INTERVAL_SECONDS
    ) {
      await this.flush(session);
    }

    if (remaining === 0) {
      await this.exhaust(key, session);
    }
  }

  /** Atomically reconciles consumed seconds (and usage counters) into persistent storage. */
  private async flush(session: BillingSession): Promise<void> {
    const delta = session.secondsConsumed - session.lastFlushedSeconds;
    if (delta <= 0) return;

    await this.usersRepository.decrementTranslationBalance(
      session.listenerId,
      delta,
    );

    const [detectedSourceLanguage] = session.detectedSourceLanguages;
    await this.translationUsageRepository.flushConsumption(session.sessionId, {
      secondsConsumed: session.secondsConsumed,
      interimDelta: session.interimDelta || undefined,
      finalDelta: session.finalDelta || undefined,
      detectedSourceLanguage,
    });

    session.lastFlushedSeconds = session.secondsConsumed;
    session.interimDelta = 0;
    session.finalDelta = 0;
    session.detectedSourceLanguages.clear();
  }

  /** Balance reached 0: stop the ticker, do a final flush, and notify the manager (FR-023, SC-012). */
  private async exhaust(key: string, session: BillingSession): Promise<void> {
    clearInterval(session.ticker);
    this.sessions.delete(key);

    await this.flush(session);
    await this.translationUsageRepository.finalizeSession(
      session.sessionId,
      TranslationUsageEndReason.CREDITS_EXHAUSTED,
      session.secondsConsumed,
    );
    await this.translationStateService.deleteBalance(
      session.listenerId,
      session.sessionId,
    );
    await this.translationStateService.clearLowBalanceFlag(session.sessionId);

    this.logger.log(
      `Translation credits exhausted for listener ${session.listenerId} (session ${session.sessionId})`,
    );
    session.callbacks.onExhausted();
  }

  /** Stops billing for a listener leaving voluntarily (unsubscribe, disconnect, pipeline teardown). */
  async stop(
    roomId: string,
    speakerId: string,
    listenerId: string,
    endReason: TranslationUsageEndReason,
  ): Promise<void> {
    const key = this.key(roomId, speakerId, listenerId);
    const session = this.sessions.get(key);
    if (!session) return;

    clearInterval(session.ticker);
    this.sessions.delete(key);

    await this.flush(session);
    await this.translationUsageRepository.finalizeSession(
      session.sessionId,
      endReason,
      session.secondsConsumed,
    );
    await this.translationStateService.deleteBalance(
      session.listenerId,
      session.sessionId,
    );
    await this.translationStateService.clearLowBalanceFlag(session.sessionId);
  }
}
