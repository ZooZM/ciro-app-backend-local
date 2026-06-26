import { StatusRepository } from './status.repository';
import { UsersRepository } from '../users/users.repository';
import { ChatService } from '../chat/chat.service';
import { ChatGateway } from '../chat/chat.gateway';
import { PushService } from '../notifications/push.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReactStatusDto } from './dto/react-status.dto';
import { ReplyStatusDto } from './dto/reply-status.dto';
import { StatusDocument } from './schemas/status.schema';
export declare class StatusService {
    private readonly statusRepository;
    private readonly usersRepository;
    private readonly chatService;
    private readonly chatGateway;
    private readonly pushService;
    constructor(statusRepository: StatusRepository, usersRepository: UsersRepository, chatService: ChatService, chatGateway: ChatGateway, pushService: PushService);
    createStatus(userId: string, dto: CreateStatusDto, file?: Express.Multer.File): Promise<{
        status: Record<string, unknown>;
        isNew: boolean;
    }>;
    private broadcastExploreStatusAdded;
    getFeed(userId: string): Promise<Record<string, unknown>[]>;
    getViewers(statusId: string, userId: string): Promise<Record<string, unknown>[]>;
    getReactions(statusId: string, userId: string): Promise<Record<string, unknown>[]>;
    recordView(statusId: string, viewerId: string): Promise<void>;
    react(statusId: string, userId: string, dto: ReactStatusDto): Promise<{
        statusId: string;
        reaction: string;
    }>;
    reply(statusId: string, userId: string, dto: ReplyStatusDto): Promise<import("../chat/schemas/message.schema").MessageDocument>;
    getDefaultAudience(userId: string): Promise<Record<string, unknown>[]>;
    getStatusForMediaAccess(statusId: string, userId: string): Promise<StatusDocument>;
    private checkVisibilityOrThrow;
    private isPermittedToView;
    private fanOutStatusReceived;
    private toStatusJson;
}
