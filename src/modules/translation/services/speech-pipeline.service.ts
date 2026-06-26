import { Inject, Injectable, Logger } from '@nestjs/common';
import type { v1 } from '@google-cloud/speech';
import type { protos } from '@google-cloud/speech';
import type { CancellableStream } from 'google-gax';
import { AudioStream, Room, RoomEvent, TrackKind } from '@livekit/rtc-node';
import type {
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
} from '@livekit/rtc-node';
import { GOOGLE_SPEECH_CLIENT } from '../providers/google-speech.provider';
import { LiveKitRtcProvider } from '../providers/livekit-rtc.provider';
import { TRANSLATION_CONFIG } from '../translation.config';
import type { TranslationConfig } from '../translation.config';
import {
  SegmentLanguageLock,
  SpeakerLanguageCache,
} from './language-detection.util';

/** STT audio format requested from LiveKit (mono 16kHz PCM, Google's recommended rate). */
const STT_SAMPLE_RATE_HZ = 16000;
const STT_CHANNELS = 1;

/** How long to wait for the speaker's audio track to become available/subscribed. */
const SPEAKER_TRACK_TIMEOUT_MS = 15_000;

/** How long to wait for the first language detection before reporting `language_undetected`. */
const LANGUAGE_DETECTION_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// VAD configuration
//
// VAD_ENERGY_THRESHOLD — minimum RMS on a 0–32767 (Int16 PCM) scale to
//   classify a frame as speech.
//     ~50–200  = near-silent (zeros, mic off)
//     ~200–400 = quiet-room / breath noise
//     ~500+    = speech
//   Raise if "[VAD] Speech Detected" fires during background noise.
//   Lower if the first word is frequently missed.
//
// VAD_SILENCE_WINDOW_MS — sub-threshold frames are still written to STT
//   for this many ms (the "silence-pending" window) before the gate closes.
//   This preserves trailing consonants and short intra-sentence pauses.
//   Raise to tolerate longer natural pauses without gating mid-utterance.
//
// PRE_SPEECH_BUFFER_MS — audio buffered during the gate window and flushed
//   to STT the instant speech resumes, so the rising onset syllable (which
//   appears just before the energy threshold is crossed) is not lost.
// ---------------------------------------------------------------------------
const VAD_ENERGY_THRESHOLD = 400;
const VAD_SILENCE_WINDOW_MS = 500;
const PRE_SPEECH_BUFFER_MS = 300;
/** "[STT] Pumping Audio" heartbeat interval (ms). */
const PUMP_LOG_INTERVAL_MS = 2_000;

/** Mirrors the `translation_unavailable.reason` enum (contracts/socket-events.md, FR-014/SC-010). */
export type PipelineFailureReason =
  | 'language_undetected'
  | 'unsupported_language'
  | 'service_outage';

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  /** Locked source language for this segment (FR-013a). */
  sourceLanguage: string;
}

export interface SpeechPipelineCallbacks {
  onTranscript(result: TranscriptResult): void;
  onError(reason: PipelineFailureReason): void;
}

export interface OpenPipelineHandle {
  livekitRoom: Room;
}

/** One Google `StreamingRecognize` duplex stream and its suppression flag (T031/T032). */
interface StreamHandle {
  stream: CancellableStream;
  /** While `true`, results/errors from this stream are ignored (overlap/old streams). */
  suppressed: { value: boolean };
  detectionTimeout?: NodeJS.Timeout;
}

/** Per-(room,speaker) rotation state for an open pipeline (T031/T032). */
interface PipelineSession {
  roomId: string;
  speakerId: string;
  livekitRoom: Room;
  audioStream: AudioStream;
  segmentLock: SegmentLanguageLock;
  callbacks: SpeechPipelineCallbacks;
  /** The stream whose results are currently forwarded to callbacks. */
  current: StreamHandle;
  /** Present only during the overlap window while rotating (T031). */
  next?: StreamHandle;
  rotationTimer?: NodeJS.Timeout;
  overlapTimer?: NodeJS.Timeout;
  closed: boolean;
}

/**
 * Joins a call's LiveKit room as a hidden, non-publishing agent, selectively
 * subscribes to ONE speaker's audio track, and streams it to Google
 * Speech-to-Text with auto language detection (FR-003, FR-010, FR-013).
 *
 * Recognition results are run through {@link SegmentLanguageLock} to lock the
 * detected language for the in-flight segment and prime
 * {@link SpeakerLanguageCache} for the next segment (refinement #2).
 *
 * Google's `StreamingRecognize` enforces a ~5-minute single-stream limit.
 * Before that limit, this service transparently rotates to a fresh stream
 * primed with the cached language: the new stream overlaps with the old one
 * for {@link TranslationConfig.sttRotationOverlapMs} so no audio is dropped,
 * while the old stream's (and overlap-window new stream's) results are
 * suppressed to avoid duplicate captions (T031/T032).
 */
@Injectable()
export class SpeechPipelineService {
  private readonly logger = new Logger(SpeechPipelineService.name);
  private readonly sessions = new Map<string, PipelineSession>();

  constructor(
    private readonly liveKitRtcProvider: LiveKitRtcProvider,
    @Inject(GOOGLE_SPEECH_CLIENT)
    private readonly speechClient: v1.SpeechClient,
    @Inject(TRANSLATION_CONFIG) private readonly config: TranslationConfig,
    private readonly speakerLanguageCache: SpeakerLanguageCache,
  ) {}

  private sessionKey(roomId: string, speakerId: string): string {
    return `${roomId}:${speakerId}`;
  }

  /**
   * Opens a translation pipeline for `(roomId, speakerId)`: connects a hidden
   * agent to the LiveKit room, subscribes to the speaker's audio, and starts
   * streaming recognition. Recognition results are reported via `callbacks`.
   */
  async open(
    roomId: string,
    speakerId: string,
    callbacks: SpeechPipelineCallbacks,
  ): Promise<OpenPipelineHandle> {
    const livekitRoom = this.liveKitRtcProvider.createRoom();
    const agentIdentity = `translation-agent:${roomId}:${speakerId}`;
    const token = await this.liveKitRtcProvider.createAgentToken(
      roomId,
      agentIdentity,
    );

    await livekitRoom.connect(
      this.liveKitRtcProvider.wsUrl,
      token,
      this.liveKitRtcProvider.connectOptions,
    );

    let audioTrack: RemoteTrack;
    try {
      audioTrack = await this.subscribeToSpeakerAudio(livekitRoom, speakerId);
    } catch (error) {
      await livekitRoom.disconnect();
      throw error;
    }

    const segmentLock = new SegmentLanguageLock();
    const audioStream = new AudioStream(
      audioTrack,
      STT_SAMPLE_RATE_HZ,
      STT_CHANNELS,
    );

    const current = this.openStream(roomId, speakerId, segmentLock, callbacks, {
      applyDetectionTimeout: true,
    });

    const session: PipelineSession = {
      roomId,
      speakerId,
      livekitRoom,
      audioStream,
      segmentLock,
      callbacks,
      current,
      closed: false,
    };
    this.sessions.set(this.sessionKey(roomId, speakerId), session);

    this.scheduleRotation(session);
    void this.pumpAudio(session);

    return { livekitRoom };
  }

  /** Tears down a pipeline: ends all STT stream(s) and disconnects the agent (T030). */
  async close(roomId: string, speakerId: string): Promise<void> {
    const key = this.sessionKey(roomId, speakerId);
    const session = this.sessions.get(key);
    if (!session) return;

    session.closed = true;
    if (session.rotationTimer) clearTimeout(session.rotationTimer);
    if (session.overlapTimer) clearTimeout(session.overlapTimer);

    session.current.suppressed.value = true;
    this.endStream(session.current);
    if (session.next) {
      session.next.suppressed.value = true;
      this.endStream(session.next);
    }

    this.sessions.delete(key);
    await session.livekitRoom.disconnect();
  }

  /** Selectively subscribes to `speakerId`'s audio track only (FR-003, FR-010). */
  private async subscribeToSpeakerAudio(
    room: Room,
    speakerId: string,
  ): Promise<RemoteTrack> {
    const existingPublication = this.findAudioPublication(room, speakerId);
    if (existingPublication?.track) {
      return existingPublication.track as RemoteTrack;
    }
    if (existingPublication && !existingPublication.subscribed) {
      existingPublication.setSubscribed(true);
    }

    return new Promise<RemoteTrack>((resolve, reject) => {
      const onTrackSubscribed = (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (
          participant.identity === speakerId &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          cleanup();
          resolve(track);
        }
      };

      const onTrackPublished = (
        publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (
          participant.identity === speakerId &&
          publication.kind === TrackKind.KIND_AUDIO
        ) {
          publication.setSubscribed(true);
        }
      };

      const onParticipantConnected = (participant: RemoteParticipant) => {
        if (participant.identity !== speakerId) return;
        const publication = this.findAudioPublication(room, speakerId);
        if (publication && !publication.subscribed) {
          publication.setSubscribed(true);
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(`Timed out waiting for speaker ${speakerId}'s audio track`),
        );
      }, SPEAKER_TRACK_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
        room.off(RoomEvent.TrackPublished, onTrackPublished);
        room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      };

      room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.on(RoomEvent.TrackPublished, onTrackPublished);
      room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    });
  }

  private findAudioPublication(
    room: Room,
    speakerId: string,
  ): RemoteTrackPublication | undefined {
    const participant = room.remoteParticipants.get(speakerId);
    if (!participant) return undefined;

    for (const publication of participant.trackPublications.values()) {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        return publication;
      }
    }
    return undefined;
  }

  /**
   * Opens one Google `StreamingRecognize` duplex stream primed with the
   * cached/default language (FR-013, refinement #2). Results are forwarded
   * to `callbacks` unless the returned handle's `suppressed` flag is set —
   * used during stream rotation to discard the overlapping/old stream's
   * output (T031/T032).
   */
  private openStream(
    roomId: string,
    speakerId: string,
    segmentLock: SegmentLanguageLock,
    callbacks: SpeechPipelineCallbacks,
    opts: { applyDetectionTimeout: boolean },
  ): StreamHandle {
    const primaryLanguage =
      this.speakerLanguageCache.primaryLanguageForNextSegment(
        roomId,
        speakerId,
        this.config.primaryLanguage,
      );
    const alternativeLanguageCodes = this.config.candidateLanguages.filter(
      (code) => code !== primaryLanguage,
    );

    const stream = this.speechClient._streamingRecognize();
    const suppressed = { value: false };

    let languageDetected = false;
    let detectionTimeout: NodeJS.Timeout | undefined;
    if (opts.applyDetectionTimeout) {
      detectionTimeout = setTimeout(() => {
        if (!languageDetected) {
          callbacks.onError('language_undetected');
        }
      }, LANGUAGE_DETECTION_TIMEOUT_MS);
    }

    stream.on(
      'data',
      (response: protos.google.cloud.speech.v1.IStreamingRecognizeResponse) => {
        if (suppressed.value) return;

        if (response.error) {
          if (detectionTimeout) clearTimeout(detectionTimeout);
          // gRPC OUT_OF_RANGE (11) = "Audio Timeout Error: Long duration elapsed
          // without audio." The speaker paused; treat as language_undetected so
          // the Flutter client auto-retries instead of showing a terminal error.
          const isAudioTimeout =
            response.error.code === 11 ||
            (response.error.message ?? '').includes('Audio Timeout');
          const reason = isAudioTimeout
            ? 'language_undetected'
            : 'service_outage';
          this.logger.warn(
            `STT error for ${roomId}/${speakerId} [${reason}]: ${response.error.message ?? 'unknown error'}`,
          );
          callbacks.onError(reason);
          return;
        }

        for (const result of response.results ?? []) {
          const transcript = result.alternatives?.[0]?.transcript;
          if (!transcript) continue;

          const isFinal = !!result.isFinal;
          const lockedLanguage = segmentLock.onResult(
            result.languageCode ?? null,
            isFinal,
          );
          if (!lockedLanguage) continue;

          if (!languageDetected) {
            languageDetected = true;
            if (detectionTimeout) clearTimeout(detectionTimeout);
          }
          if (isFinal) {
            this.speakerLanguageCache.recordDetectedLanguage(
              roomId,
              speakerId,
              lockedLanguage,
            );
          }

          callbacks.onTranscript({
            text: transcript,
            isFinal,
            sourceLanguage: lockedLanguage,
          });
        }
      },
    );

    stream.on('error', (error: Error) => {
      if (suppressed.value) return;
      if (detectionTimeout) clearTimeout(detectionTimeout);
      const isAudioTimeout =
        (error as unknown as { code?: number }).code === 11 ||
        error.message.includes('Audio Timeout');
      const reason = isAudioTimeout ? 'language_undetected' : 'service_outage';
      this.logger.warn(
        `STT stream error for ${roomId}/${speakerId} [${reason}]: ${error.message}`,
      );
      callbacks.onError(reason);
    });

    stream.write({
      streamingConfig: {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: STT_SAMPLE_RATE_HZ,
          languageCode: primaryLanguage,
          ...(alternativeLanguageCodes.length > 0
            ? { alternativeLanguageCodes }
            : {}),
        },
        interimResults: true,
      },
    });

    return { stream, suppressed, detectionTimeout };
  }

  /** Schedules the next overlapping rotation, `sttRotationLeadMs` from now (T031). */
  private scheduleRotation(session: PipelineSession): void {
    session.rotationTimer = setTimeout(() => {
      this.rotateStream(session);
    }, this.config.sttRotationLeadMs);
  }

  /**
   * Begins an overlapping rotation: opens a new (suppressed) stream and starts
   * feeding it audio alongside the current stream for `sttRotationOverlapMs`,
   * so no speech chunk is lost across the boundary (T031).
   */
  private rotateStream(session: PipelineSession): void {
    if (session.closed) return;

    const next = this.openStream(
      session.roomId,
      session.speakerId,
      session.segmentLock,
      session.callbacks,
      { applyDetectionTimeout: false },
    );
    next.suppressed.value = true;
    session.next = next;

    session.overlapTimer = setTimeout(() => {
      this.completeRotation(session);
    }, this.config.sttRotationOverlapMs);
  }

  /** Ends the overlap window: closes the old stream and promotes the new one (T031/T032). */
  private completeRotation(session: PipelineSession): void {
    if (session.closed || !session.next) return;

    const old = session.current;
    old.suppressed.value = true;
    this.endStream(old);

    const next = session.next;
    next.suppressed.value = false;
    session.current = next;
    session.next = undefined;

    this.scheduleRotation(session);
  }

  private endStream(handle: StreamHandle): void {
    if (handle.detectionTimeout) clearTimeout(handle.detectionTimeout);
    try {
      handle.stream.end();
      handle.stream.cancel();
    } catch {
      // Stream may already be closed/errored — safe to ignore.
    }
  }

  /** Pumps decoded PCM frames into whichever STT stream(s) are currently active (T031).
   *  A VAD gate blocks writes during silence (after VAD_SILENCE_WINDOW_MS) and resumes
   *  by flushing a PRE_SPEECH_BUFFER_MS rolling buffer so the speech onset is not lost. */
  private async pumpAudio(session: PipelineSession): Promise<void> {
    const key = `${session.roomId}/${session.speakerId}`;

    // VAD state
    let speechActive = false;
    let silenceStartMs: number | null = null;
    /** True once the silence window expires — blocks STT writes until speech resumes. */
    let vadGated = false;
    /** Rolling pre-speech buffer flushed to STT on gate lift to avoid losing the onset. */
    const preBuffer: { audioContent: Buffer; timestamp: number }[] = [];

    let lastPumpLogMs = 0;
    let frameCount = 0;

    try {
      for await (const frame of session.audioStream) {
        if (session.closed) break;

        frameCount++;
        const audioContent = Buffer.from(
          frame.data.buffer,
          frame.data.byteOffset,
          frame.data.byteLength,
        );
        // Interpret raw bytes as signed 16-bit PCM for energy computation.
        const pcm = new Int16Array(
          frame.data.buffer,
          frame.data.byteOffset,
          Math.floor(frame.data.byteLength / 2),
        );
        const rms = this.computeRmsEnergy(pcm);
        const nowMs = Date.now();

        // ── VAD gate ─────────────────────────────────────────────────────
        if (rms > VAD_ENERGY_THRESHOLD) {
          if (!speechActive) {
            speechActive = true;
            silenceStartMs = null;

            if (vadGated) {
              // Gate lifts: flush buffered pre-speech audio first so STT
              // receives the rising onset before this frame.
              vadGated = false;
              const flushed = preBuffer.length;
              for (const { audioContent: buf } of preBuffer) {
                this.writeToStream(session.current, buf);
                if (session.next) this.writeToStream(session.next, buf);
              }
              preBuffer.length = 0;
              this.logger.log(
                `[VAD] Speech Detected | ${key}` +
                  ` | rms=${rms.toFixed(0)} gate lifted, flushed ${flushed} pre-speech frames`,
              );
            } else {
              this.logger.log(
                `[VAD] Speech Detected | ${key}` +
                  ` | rms=${rms.toFixed(0)} threshold=${VAD_ENERGY_THRESHOLD}`,
              );
            }
          }
        } else {
          if (speechActive) {
            speechActive = false;
            silenceStartMs = nowMs;
          } else if (silenceStartMs === null) {
            silenceStartMs = nowMs;
          }

          if (
            !vadGated &&
            silenceStartMs !== null &&
            nowMs - silenceStartMs >= VAD_SILENCE_WINDOW_MS
          ) {
            vadGated = true;
            this.logger.log(
              `[VAD] Silence Timeout Triggered | ${key}` +
                ` | silenceDuration=${nowMs - silenceStartMs}ms` +
                ` threshold=${VAD_SILENCE_WINDOW_MS}ms rms=${rms.toFixed(0)}` +
                ` — STT gate closed`,
            );
          }
        }

        // Write to STT or buffer for pre-speech flush on gate lift.
        if (!vadGated) {
          this.writeToStream(session.current, audioContent);
          if (session.next) this.writeToStream(session.next, audioContent);
        } else {
          preBuffer.push({ audioContent, timestamp: nowMs });
          // Evict frames older than the pre-speech window.
          while (
            preBuffer.length > 0 &&
            nowMs - preBuffer[0].timestamp > PRE_SPEECH_BUFFER_MS
          ) {
            preBuffer.shift();
          }
        }

        // Heartbeat log — vadGated=true here confirms the gate is active.
        if (nowMs - lastPumpLogMs >= PUMP_LOG_INTERVAL_MS) {
          lastPumpLogMs = nowMs;
          this.logger.log(
            `[STT] Pumping Audio | ${key}` +
              ` | frames=${frameCount} speechActive=${speechActive}` +
              ` vadGated=${vadGated} rms=${rms.toFixed(0)}`,
          );
        }
        // ─────────────────────────────────────────────────────────────────
      }
    } catch (error) {
      this.logger.error(
        `Audio pump stopped for ${session.roomId}/${session.speakerId}: ${(error as Error).message}`,
      );
    }
  }

  /** RMS energy of an Int16 PCM frame on a 0–32767 scale (used for VAD diagnostics). */
  private computeRmsEnergy(samples: Int16Array): number {
    if (samples.length === 0) return 0;
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    return Math.sqrt(sumSq / samples.length);
  }

  private writeToStream(handle: StreamHandle, audioContent: Buffer): void {
    if (handle.stream.destroyed || !handle.stream.writable) return;
    handle.stream.write({ audioContent });
  }
}
