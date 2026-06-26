import { Injectable } from '@nestjs/common';

/**
 * Per-segment language lock state machine (R2 / FR-013a).
 *
 * Once a non-empty language is detected for the in-flight segment, it is
 * **locked** and returned for every subsequent result until a segment
 * boundary (`isFinal` result, or an explicit silence/VAD `reset()`) clears
 * it — allowing the next utterance to lock onto a different language.
 *
 * One instance is held per `ActivePipeline` (data-model.md §3).
 */
export class SegmentLanguageLock {
  private locked: string | null = null;

  /**
   * Feeds one STT result into the state machine.
   * @returns the language locked for this segment, or `null` if nothing has
   *          been detected yet for the in-flight segment.
   */
  onResult(
    detectedLanguage: string | null | undefined,
    isFinal: boolean,
  ): string | null {
    if (!this.locked && detectedLanguage) {
      this.locked = detectedLanguage;
    }
    const lockedForThisResult = this.locked;
    if (isFinal) {
      this.locked = null;
    }
    return lockedForThisResult;
  }

  /** Explicit segment-boundary reset (e.g. VAD silence timeout) without a final result. */
  reset(): void {
    this.locked = null;
  }

  /** Currently locked language for the in-flight segment, if any. */
  get current(): string | null {
    return this.locked;
  }
}

/**
 * Per-speaker (room, speaker) cache of the last successfully detected
 * source language (refinement #2). Primes the next stream/segment's
 * primary language, eliminating re-detection latency after a silence
 * timeout / stream rotation.
 */
@Injectable()
export class SpeakerLanguageCache {
  private readonly cache = new Map<string, string>();

  private key(roomId: string, speakerId: string): string {
    return `${roomId}:${speakerId}`;
  }

  /** Records the language successfully detected for a completed segment. */
  recordDetectedLanguage(
    roomId: string,
    speakerId: string,
    language: string,
  ): void {
    this.cache.set(this.key(roomId, speakerId), language);
  }

  /**
   * Primary language to prime the next stream/segment with: the last
   * detected language for this speaker, or `defaultLanguage` if none yet.
   */
  primaryLanguageForNextSegment(
    roomId: string,
    speakerId: string,
    defaultLanguage: string,
  ): string {
    return this.cache.get(this.key(roomId, speakerId)) ?? defaultLanguage;
  }

  /** Clears the cache entry, e.g. on pipeline teardown (T030). */
  clear(roomId: string, speakerId: string): void {
    this.cache.delete(this.key(roomId, speakerId));
  }
}
