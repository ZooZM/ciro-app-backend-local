import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatRoomsRepository } from '../chat/chat-rooms.repository';
import { SubscribeTranslationDto } from './dto/subscribe-translation.dto';
import { ChangeTargetLanguageDto } from './dto/change-target-language.dto';
import { UnsubscribeTranslationDto } from './dto/unsubscribe-translation.dto';
import { TranslationManagerService, type TranslationManagerEventHandler, type TranslationUnavailableEvent, type CreditsLowEvent, type CreditsExhaustedEvent } from './services/translation-manager.service';
export interface AuthenticatedSocket extends Socket {
    user?: {
        userId: string;
        phoneNumber: string;
    };
    translationSubscriptions?: Set<string>;
}
export declare class TranslationGateway implements OnGatewayConnection, OnGatewayDisconnect, TranslationManagerEventHandler {
    private readonly jwtService;
    private readonly chatRoomsRepository;
    private readonly translationManagerService;
    server: Server;
    private readonly logger;
    constructor(jwtService: JwtService, chatRoomsRepository: ChatRoomsRepository, translationManagerService: TranslationManagerService);
    handleConnection(client: AuthenticatedSocket): Promise<void>;
    handleDisconnect(client: AuthenticatedSocket): Promise<void>;
    private assertRoomMember;
    private subscriptionKey;
    handleSubscribe(client: AuthenticatedSocket, payload: SubscribeTranslationDto): Promise<void>;
    handleChangeLanguage(client: AuthenticatedSocket, payload: ChangeTargetLanguageDto): Promise<void>;
    handleUnsubscribe(client: AuthenticatedSocket, payload: UnsubscribeTranslationDto): Promise<void>;
    private handleSubscribeRequest;
    onTranslationUnavailable(listenerId: string, event: TranslationUnavailableEvent): void;
    onCreditsLow(listenerId: string, event: CreditsLowEvent): void;
    onCreditsExhausted(listenerId: string, event: CreditsExhaustedEvent): void;
}
