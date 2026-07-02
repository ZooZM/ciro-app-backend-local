import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  ChatRoom,
  ChatRoomDocument,
  ChatRoomType,
} from '../chat/schemas/chat-room.schema';
import {
  Status,
  StatusDocument,
  StatusPrivacy,
} from '../status/schemas/status.schema';

@Injectable()
export class MapRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ChatRoom.name)
    private readonly chatRoomModel: Model<ChatRoomDocument>,
    @InjectModel(Status.name)
    private readonly statusModel: Model<StatusDocument>,
  ) {}

  /**
   * Users who share at least one chat room (PRIVATE or GROUP) with `userId`.
   * Excludes `userId` itself. The relation is symmetric, so this also
   * answers "who can see `userId` via shared rooms".
   */
  async getSharedRoomParticipantIds(userId: string): Promise<string[]> {
    const objectId = new Types.ObjectId(userId);
    const rooms = await this.chatRoomModel
      .find({ participants: objectId })
      .select('participants')
      .lean()
      .exec();

    const ids = new Set<string>();
    for (const room of rooms) {
      for (const participant of room.participants) {
        const id = participant.toString();
        if (id !== userId) ids.add(id);
      }
    }
    return Array.from(ids);
  }

  /** Users who have `userId` in their own `blockedUsers` list. */
  async getUsersWhoBlocked(userId: string): Promise<string[]> {
    const objectId = new Types.ObjectId(userId);
    const blockers = await this.userModel
      .find({ blockedUsers: objectId })
      .select('_id')
      .lean()
      .exec();
    return blockers.map((u) => u._id.toString());
  }

  /** The caller's GROUP chat rooms, for the map group filter (FR-017/023). */
  async getGroupRoomsForUser(userId: string) {
    const objectId = new Types.ObjectId(userId);
    return this.chatRoomModel
      .find({ participants: objectId, type: ChatRoomType.GROUP })
      .select('name avatarUrl participants')
      .lean()
      .exec();
  }

  /** Map of userId -> GROUP room ids shared with `viewerId` (for `sharedGroupIds`). */
  async getSharedGroupIdsByMember(
    viewerId: string,
  ): Promise<Map<string, string[]>> {
    const groups = await this.getGroupRoomsForUser(viewerId);
    const map = new Map<string, string[]>();
    for (const room of groups) {
      const roomId = room._id.toString();
      for (const participant of room.participants) {
        const memberId = participant.toString();
        if (memberId === viewerId) continue;
        const existing = map.get(memberId) ?? [];
        existing.push(roomId);
        map.set(memberId, existing);
      }
    }
    return map;
  }

  /** User ids with an active (non-expired) SHOW_ON_MAP status (Explore tab, FR-001a/b). */
  async getActiveShowOnMapAuthorIds(): Promise<string[]> {
    const statuses = await this.statusModel
      .find({
        privacy: StatusPrivacy.SHOW_ON_MAP,
        expiresAt: { $gt: new Date() },
      })
      .select('authorId')
      .lean()
      .exec();
    const ids = new Set(statuses.map((s) => s.authorId.toString()));
    return Array.from(ids);
  }
}
