import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { MapRepository } from './map.repository';
import { ChatGateway } from '../chat/chat.gateway';

export interface MapUserDto {
  _id: string;
  name: string;
  phoneNumber: string;
  avatarUrl?: string;
  isOnline: boolean;
  location: { type: 'Point'; coordinates: [number, number] };
  locationUpdatedAt: string;
  sharedGroupIds: string[];
  isCoarse?: boolean;
  hasActiveStatus?: boolean;
}

/** Truncates to ~2 decimal places (~1.1km grid) — FR-001b, R9. */
export function coarsen(value: number): number {
  return Math.trunc(value * 100) / 100;
}

@Injectable()
export class MapService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mapRepository: MapRepository,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  async updateLocation(userId: string, lng: number, lat: number) {
    return this.usersService.updateLocation(userId, lng, lat);
  }

  /**
   * Users authorized to see/be-seen by `userId`: shared chat-room
   * participants ∪ mutual contacts, minus blocked (both directions) and
   * self. Symmetric relation — also answers "who can see `userId`"
   * (data-model.md "Authorization derivation"; FR-010/014/015).
   */
  async authorizedObserverIds(userId: string): Promise<Set<string>> {
    const [shared, mutuals, blockedByMe, blockedMe] = await Promise.all([
      this.mapRepository.getSharedRoomParticipantIds(userId),
      this.usersService.findMutualContactIds(userId),
      this.usersService.getBlockedUserIds(userId),
      this.mapRepository.getUsersWhoBlocked(userId),
    ]);

    const excluded = new Set<string>([
      ...blockedByMe,
      ...blockedMe.map((id) => id.toString()),
      userId,
    ]);

    const result = new Set<string>();
    for (const id of shared) {
      if (!excluded.has(id)) result.add(id);
    }
    for (const id of mutuals.map((m) => m.toString())) {
      if (!excluded.has(id)) result.add(id);
    }
    return result;
  }

  /** Full authorized set (non-distance-limited) for the "All Locations" filter (FR-018). */
  async getVisibleUsers(viewerId: string): Promise<MapUserDto[]> {
    const authorizedIds = Array.from(await this.authorizedObserverIds(viewerId));
    if (!authorizedIds.length) return [];

    const [users, sharedGroupIdsByMember, statusAuthorIds] = await Promise.all([
      this.usersService.findManyByIds(authorizedIds),
      this.mapRepository.getSharedGroupIdsByMember(viewerId),
      this.mapRepository.getActiveShowOnMapAuthorIds(),
    ]);
    const statusAuthorSet = new Set(statusAuthorIds);

    return users
      .filter(
        (u: any) =>
          u.isGhostMode !== true &&
          u.isSharingLocation === true &&
          u.location?.coordinates,
      )
      .map((u: any) =>
        this.toMapUserDto(
          u,
          sharedGroupIdsByMember,
          false,
          statusAuthorSet.has(u._id.toString()),
        ),
      );
  }

  async getNearbyUsers(
    userId: string,
    lng: number,
    lat: number,
    maxDistanceKm: number,
  ): Promise<MapUserDto[]> {
    const authorizedIds = Array.from(await this.authorizedObserverIds(userId));
    const sharedGroupIdsByMember = await this.mapRepository.getSharedGroupIdsByMember(
      userId,
    );
    const users = await this.usersService.getNearbyUsers(
      userId,
      lng,
      lat,
      maxDistanceKm,
      authorizedIds,
    );
    return users.map((u: any) =>
      this.toMapUserDto(u, sharedGroupIdsByMember, false, u.hasActiveStatus === true),
    );
  }

  /**
   * Explore tab (FR-001a/b): users with an active SHOW_ON_MAP status. For
   * non-contacts, coordinates are coarsened server-side — precise live
   * coordinates are reserved for the Following (authorized) path.
   */
  async getExploreUsers(viewerId: string): Promise<MapUserDto[]> {
    const [authorIds, authorizedIds] = await Promise.all([
      this.mapRepository.getActiveShowOnMapAuthorIds(),
      this.authorizedObserverIds(viewerId),
    ]);
    const candidateIds = authorIds.filter((id) => id !== viewerId);
    if (!candidateIds.length) return [];

    const users = await this.usersService.findManyByIds(candidateIds);
    const sharedGroupIdsByMember = await this.mapRepository.getSharedGroupIdsByMember(
      viewerId,
    );

    return users
      .filter((u: any) => u.location?.coordinates)
      .map((u: any) => {
        const isAuthorized = authorizedIds.has(u._id.toString());
        // Every candidate here came from getActiveShowOnMapAuthorIds(), so
        // by construction all of them currently have an active status.
        return this.toMapUserDto(u, sharedGroupIdsByMember, !isAuthorized, true);
      });
  }

  async getGroups(userId: string) {
    const rooms = await this.mapRepository.getGroupRoomsForUser(userId);
    return rooms.map((room: any) => ({
      id: room._id.toString(),
      name: room.name ?? 'Group',
      memberCount: room.participants?.length ?? 0,
      avatarUrl: room.avatarUrl ?? null,
      initials: (room.name ?? 'G')
        .split(' ')
        .map((w: string) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase(),
    }));
  }

  /** FR-012: toggling Ghost Mode propagates to authorized observers in near-real-time. */
  async setGhostMode(userId: string, enabled: boolean) {
    await this.usersService.setGhostMode(userId, enabled);

    const roomIds = this.chatGateway.getUserRoomIds(userId);
    if (enabled) {
      // Same race as Stop Sharing: drop any update enqueued moments ago but
      // not yet flushed, so it can't resurrect the marker right after this.
      this.chatGateway.cancelPendingLocationUpdates(userId);
      for (const roomId of roomIds) {
        this.chatGateway.server.to(roomId).emit('locationHidden', { userId });
      }
    } else {
      const user = await this.usersService.findById(userId);
      if (user?.location?.coordinates && user.locationUpdatedAt) {
        const [longitude, latitude] = user.location.coordinates;
        for (const roomId of roomIds) {
          this.chatGateway.server.to(roomId).emit('locationUpdate', {
            updates: [
              {
                userId,
                longitude,
                latitude,
                isOnline: user.isOnline === true,
                lastUpdatedAt: user.locationUpdatedAt.toISOString(),
              },
            ],
          });
        }
      }
    }

    return { isGhostMode: enabled };
  }

  async getGhostMode(userId: string) {
    return { isGhostMode: await this.usersService.isGhostMode(userId) };
  }

  private toMapUserDto(
    user: any,
    sharedGroupIdsByMember: Map<string, string[]>,
    forceCoarse = false,
    hasActiveStatus = false,
  ): MapUserDto {
    const id = user._id.toString();
    const [lng, lat] = user.location.coordinates;
    const isCoarse = forceCoarse === true;
    return {
      _id: id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      isOnline: user.isOnline === true,
      location: {
        type: 'Point',
        coordinates: isCoarse ? [coarsen(lng), coarsen(lat)] : [lng, lat],
      },
      locationUpdatedAt: (user.locationUpdatedAt ?? new Date(0)).toISOString
        ? user.locationUpdatedAt.toISOString()
        : new Date(user.locationUpdatedAt ?? 0).toISOString(),
      sharedGroupIds: sharedGroupIdsByMember.get(id) ?? [],
      ...(isCoarse ? { isCoarse: true } : {}),
      ...(hasActiveStatus ? { hasActiveStatus: true } : {}),
    };
  }
}
