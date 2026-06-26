import { Model, Types } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { ChatRoom, ChatRoomDocument } from '../chat/schemas/chat-room.schema';
import { StatusDocument } from '../status/schemas/status.schema';
export declare class MapRepository {
    private readonly userModel;
    private readonly chatRoomModel;
    private readonly statusModel;
    constructor(userModel: Model<UserDocument>, chatRoomModel: Model<ChatRoomDocument>, statusModel: Model<StatusDocument>);
    getSharedRoomParticipantIds(userId: string): Promise<string[]>;
    getUsersWhoBlocked(userId: string): Promise<string[]>;
    getGroupRoomsForUser(userId: string): Promise<(ChatRoom & import("mongoose").Document<Types.ObjectId, any, any, Record<string, any>, {}> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[]>;
    getSharedGroupIdsByMember(viewerId: string): Promise<Map<string, string[]>>;
    getActiveShowOnMapAuthorIds(): Promise<string[]>;
}
