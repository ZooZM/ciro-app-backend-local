import { Injectable, Logger } from '@nestjs/common';
import type { Room } from '@livekit/rtc-node';

/** LiveKit data-channel topic for caption packets (contracts/caption-data-channel.md). */
export const CAPTION_DATA_TOPIC = 'translation';

export type CaptionType = 'interim' | 'final';

/** Caption payload schema (contracts/caption-data-channel.md). */
export interface CaptionPayload {
  v: 1;
  type: CaptionType;
  speakerId: string;
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
  segmentId: string;
  seq: number;
  ts: number;
}

export interface DispatchCaptionInput {
  /** The translation agent's connected LiveKit room for this (room, speaker) pipeline. */
  room: Room;
  /** LiveKit identities of listeners currently subscribed to this (speaker, targetLanguage). */
  listenerIdentities: string[];
  speakerId: string;
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
  segmentId: string;
  seq: number;
  type: CaptionType;
}

/**
 * Publishes translated caption text over the LiveKit data channel, targeted to
 * the listener identities subscribed to a given `(speaker, targetLanguage)`
 * (FR-006, FR-007, SC-009). Interim packets are lossy (best-effort, low
 * latency); final packets are reliable (FR-005).
 */
@Injectable()
export class CaptionDispatchService {
  private readonly logger = new Logger(CaptionDispatchService.name);

  async dispatch(input: DispatchCaptionInput): Promise<void> {
    if (input.listenerIdentities.length === 0) return;

    const localParticipant = input.room.localParticipant;
    if (!localParticipant) {
      this.logger.warn(
        `Cannot dispatch caption for speaker ${input.speakerId}: agent has no local participant`,
      );
      return;
    }

    const payload: CaptionPayload = {
      v: 1,
      type: input.type,
      speakerId: input.speakerId,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      text: input.text,
      segmentId: input.segmentId,
      seq: input.seq,
      ts: Date.now(),
    };

    const data = new TextEncoder().encode(JSON.stringify(payload));

    this.logger.debug(
      `[publishData] speaker=${input.speakerId} type=${input.type} topic=${CAPTION_DATA_TOPIC} destinations=${JSON.stringify(input.listenerIdentities)} bytes=${data.length}`,
    );

    try {
      await localParticipant.publishData(data, {
        reliable: input.type === 'final',
        destination_identities: input.listenerIdentities,
        topic: CAPTION_DATA_TOPIC,
      });
      this.logger.debug(
        `[publishData] OK — speaker=${input.speakerId} type=${input.type}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish caption for speaker ${input.speakerId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
