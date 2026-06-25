import type { Response } from 'express';
import { StatusService } from './status.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReactStatusDto } from './dto/react-status.dto';
import { ReplyStatusDto } from './dto/reply-status.dto';
export declare class StatusController {
    private readonly statusService;
    constructor(statusService: StatusService);
    getFeed(req: any): Promise<Record<string, unknown>[]>;
    getDefaultAudience(req: any): Promise<Record<string, unknown>[]>;
    uploadStatus(req: any, dto: CreateStatusDto, res: Response, file?: Express.Multer.File): Promise<Record<string, unknown>>;
    getViewers(req: any, id: string): Promise<Record<string, unknown>[]>;
    getReactions(req: any, id: string): Promise<Record<string, unknown>[]>;
    react(req: any, id: string, dto: ReactStatusDto): Promise<{
        statusId: string;
        reaction: string;
    }>;
    reply(req: any, id: string, dto: ReplyStatusDto): Promise<import("../chat/schemas/message.schema").MessageDocument>;
    getMedia(req: any, statusId: string, filename: string, res: Response): Promise<void>;
}
