import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { Room, type RoomOptions } from '@livekit/rtc-node';

/**
 * Typed helper around `@livekit/rtc-node` for the translation agent.
 *
 * The agent joins a call's LiveKit room as a **hidden, non-publishing
 * participant** with `autoSubscribe: false` (R1) so it pulls zero audio
 * until `translation-manager.service.ts` selectively subscribes to a
 * specific speaker's track.
 */
@Injectable()
export class LiveKitRtcProvider {
  constructor(private readonly configService: ConfigService) {}

  /** WebSocket URL of the LiveKit server (existing `LIVEKIT_WS_URL`). */
  get wsUrl(): string {
    return this.configService.get<string>('LIVEKIT_WS_URL') as string;
  }

  /** Connection options for the agent's room connection: no auto-subscribe (R1). */
  get connectOptions(): RoomOptions {
    return { autoSubscribe: false, dynacast: false };
  }

  /** Creates a new (unconnected) room handle for one translation pipeline. */
  createRoom(): Room {
    return new Room();
  }

  /**
   * Mints a join token for the hidden translation agent identity.
   * `canPublish: false` restricts audio/video track publishing.
   * `canPublishData: true` is required for `publishData()` — it is a separate
   * LiveKit grant from `canPublish` and must be set explicitly.
   */
  async createAgentToken(
    roomName: string,
    agentIdentity: string,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY') as string;
    const apiSecret = this.configService.get<string>(
      'LIVEKIT_API_SECRET',
    ) as string;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: agentIdentity,
      name: agentIdentity,
    });
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canPublishData: true,
      canSubscribe: true,
      hidden: true,
    });

    return token.toJwt();
  }
}
