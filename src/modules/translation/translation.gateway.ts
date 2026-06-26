import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatRoomsRepository } from '../chat/chat-rooms.repository';
import { SubscribeTranslationDto } from './dto/subscribe-translation.dto';
import { ChangeTargetLanguageDto } from './dto/change-target-language.dto';
import { UnsubscribeTranslationDto } from './dto/unsubscribe-translation.dto';
import {
  TranslationManagerService,
  type TranslationManagerEventHandler,
  type TranslationUnavailableEvent,
  type CreditsLowEvent,
  type CreditsExhaustedEvent,
} from './services/translation-manager.service';
import { TranslationUsageEndReason } from './schemas/translation-usage.schema';

export interface AuthenticatedSocket extends Socket {
  user?: { userId: string; phoneNumber: string };
  /** Keys (`${roomId}:${speakerId}`) this socket is subscribed to (FR-009). */
  translationSubscriptions?: Set<string>;
}

/**
 * v1 pinned-worker stance (T015a, analysis A1): in this release every active
 * translation pipeline is hosted on a single dedicated instance identified by
 * `TRANSLATION_CONFIG.workerRole` / `TRANSLATION_WORKER_ROLE`. Ownership of a
 * (room, speaker) pipeline is recorded in Redis at `xlation:owner:{room}:{speaker}`
 * (translation-state.service.ts), mirroring the `screenshare:active:*` lock.
 *
 * A subscribe arriving on a non-owner instance is expected to be routed to the
 * pinned worker via Redis (pub/sub or a queue), with control/billing events
 * (`translation:subscribed`, captions, `credits_low`, etc.) returned to the
 * originating socket through the existing Socket.IO Redis adapter. True
 * cross-instance pipeline distribution (multiple workers sharing pipelines) is
 * explicitly deferred past v1.
 */
@WebSocketGateway({
  cors: { origin: '*' }, // Rely on strict app config typically, simplified for WS
})
export class TranslationGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    TranslationManagerEventHandler
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TranslationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatRoomsRepository: ChatRoomsRepository,
    private readonly translationManagerService: TranslationManagerService,
  ) {
    this.translationManagerService.setEventHandler(this);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const queryToken = client.handshake.query.token as string;
      const authObjectToken = client.handshake.auth?.token as
        | string
        | undefined;

      let token: string | undefined = queryToken || authObjectToken;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      if (!token) throw new Error('Missing token');

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        phoneNumber: string;
      }>(token);
      client.user = { userId: payload.sub, phoneNumber: payload.phoneNumber };
      await client.join(`user:${client.user.userId}`);

      this.logger.log(
        `[WS CONNECTED] User: ${client.user.userId} | Socket: ${client.id}`,
      );
    } catch {
      this.logger.warn(
        `[WS REJECTED] Socket: ${client.id} | Invalid or missing token`,
      );
      client.disconnect(true);
    }
  }

  /** FR-009/FR-014: unsubscribes from every (room, speaker) this socket subscribed to. */
  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    if (!client.user || !client.translationSubscriptions) return;

    const userId = client.user.userId;
    for (const key of client.translationSubscriptions) {
      const [roomId, speakerId] = key.split(':');
      await this.translationManagerService.unsubscribe(
        roomId,
        speakerId,
        userId,
        TranslationUsageEndReason.LEFT_CALL,
      );
    }
    client.translationSubscriptions.clear();
  }

  /** FR-019: a listener may only subscribe to translation for calls/rooms they belong to. */
  private async assertRoomMember(
    userId: string,
    roomId: string,
  ): Promise<boolean> {
    const room = await this.chatRoomsRepository.findOne({
      _id: roomId,
      participants: userId,
    });
    return room !== null;
  }

  private subscriptionKey(roomId: string, speakerId: string): string {
    return `${roomId}:${speakerId}`;
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @SubscribeMessage('translation:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SubscribeTranslationDto,
  ) {
    await this.handleSubscribeRequest(
      client,
      payload.roomId,
      payload.speakerId,
      payload.targetLanguage,
    );
  }

  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @SubscribeMessage('translation:changeLanguage')
  async handleChangeLanguage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ChangeTargetLanguageDto,
  ) {
    await this.handleSubscribeRequest(
      client,
      payload.roomId,
      payload.speakerId,
      payload.targetLanguage,
    );
  }

  /** FR-009: explicit unsubscribe; idempotent (contracts/socket-events.md). */
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @SubscribeMessage('translation:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: UnsubscribeTranslationDto,
  ) {
    if (!client.user) return;

    await this.translationManagerService.unsubscribe(
      payload.roomId,
      payload.speakerId,
      client.user.userId,
    );
    client.translationSubscriptions?.delete(
      this.subscriptionKey(payload.roomId, payload.speakerId),
    );

    client.emit('translation:unsubscribed', {
      roomId: payload.roomId,
      speakerId: payload.speakerId,
    });
  }

  /** Shared by `translation:subscribe` and `translation:changeLanguage` (contracts/socket-events.md). */
  private async handleSubscribeRequest(
    client: AuthenticatedSocket,
    roomId: string,
    speakerId: string,
    targetLanguage: string,
  ): Promise<void> {
    if (!client.user) {
      client.emit('translation:denied', {
        roomId,
        speakerId,
        reason: 'unauthenticated',
      });
      return;
    }

    const isMember = await this.assertRoomMember(client.user.userId, roomId);
    if (!isMember) {
      client.emit('translation:denied', {
        roomId,
        speakerId,
        reason: 'not_a_participant',
      });
      return;
    }

    const result = await this.translationManagerService.subscribe(
      roomId,
      speakerId,
      client.user.userId,
      targetLanguage,
    );

    // Server -> client event shapes below are load-bearing client contracts
    // (contracts/socket-events.md, Constitution IV) — coordinate with the
    // Flutter app before changing event names or payload fields.
    switch (result.status) {
      case 'subscribed':
        (client.translationSubscriptions ??= new Set()).add(
          this.subscriptionKey(roomId, speakerId),
        );
        client.emit('translation:subscribed', {
          roomId,
          speakerId,
          targetLanguage: result.targetLanguage,
          remainingSeconds: result.remainingSeconds,
        });
        break;
      case 'denied':
        client.emit('translation:denied', {
          roomId,
          speakerId,
          reason: result.reason,
        });
        break;
      case 'unavailable':
        client.emit('translation_unavailable', {
          roomId,
          speakerId,
          reason: result.reason,
          transient: result.transient,
        });
        break;
    }
  }

  /** FR-014/SC-010: relays an async pipeline failure to the affected listener's personal room. */
  onTranslationUnavailable(
    listenerId: string,
    event: TranslationUnavailableEvent,
  ): void {
    this.server.to(`user:${listenerId}`).emit('translation_unavailable', event);
  }

  /** FR-024a/SC-015: relays the one-time low-balance warning to the listener's personal room. */
  onCreditsLow(listenerId: string, event: CreditsLowEvent): void {
    this.server.to(`user:${listenerId}`).emit('credits_low', event);
  }

  /** FR-023/FR-024/SC-012: relays the exhaustion/branch-close notification to the listener. */
  onCreditsExhausted(listenerId: string, event: CreditsExhaustedEvent): void {
    this.server.to(`user:${listenerId}`).emit('credits_exhausted', event);
  }
}
