import { Model, Types } from 'mongoose';
import { BaseRepository } from '../../common/repositories/base.repository';
import { UsersRepository } from '../users/users.repository';
import { StatusDocument } from './schemas/status.schema';
export declare class StatusRepository extends BaseRepository<StatusDocument> {
    private readonly statusModel;
    private readonly usersRepository;
    constructor(statusModel: Model<StatusDocument>, usersRepository: UsersRepository);
    findByClientStatusId(clientStatusId: string): Promise<StatusDocument | null>;
    findActiveById(statusId: string): Promise<StatusDocument | null>;
    findFeedForUser(userId: string): Promise<StatusDocument[]>;
    findViewersByStatusId(statusId: string): Promise<StatusDocument | null>;
    findReactionsByStatusId(statusId: string): Promise<StatusDocument | null>;
    upsertView(statusId: string, userId: string, viewedAt: Date): Promise<StatusDocument | null>;
    upsertReaction(statusId: string, userId: string, reaction: string, createdAt: Date): Promise<StatusDocument | null>;
    isAudienceSubsetOfMutualContacts(audience: string[], mutualContactIds: Types.ObjectId[]): boolean;
}
