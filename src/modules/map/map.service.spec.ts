import { MapService } from './map.service';
import { UsersService } from '../users/users.service';
import { MapRepository } from './map.repository';
import { ChatGateway } from '../chat/chat.gateway';

describe('MapService (FR-010/014/015, FR-001b — SC-001/008)', () => {
  let mapService: MapService;
  let usersService: jest.Mocked<Partial<UsersService>>;
  let mapRepository: jest.Mocked<Partial<MapRepository>>;
  let chatGateway: jest.Mocked<Partial<ChatGateway>>;

  beforeEach(() => {
    usersService = {
      findMutualContactIds: jest.fn().mockResolvedValue([]),
      getBlockedUserIds: jest.fn().mockResolvedValue([]),
      findManyByIds: jest.fn().mockResolvedValue([]),
      getNearbyUsers: jest.fn().mockResolvedValue([]),
      setGhostMode: jest.fn().mockResolvedValue(undefined),
      isGhostMode: jest.fn().mockResolvedValue(false),
      findById: jest.fn().mockResolvedValue(null),
    };
    mapRepository = {
      getSharedRoomParticipantIds: jest.fn().mockResolvedValue([]),
      getUsersWhoBlocked: jest.fn().mockResolvedValue([]),
      getSharedGroupIdsByMember: jest.fn().mockResolvedValue(new Map()),
      getActiveShowOnMapAuthorIds: jest.fn().mockResolvedValue([]),
      getGroupRoomsForUser: jest.fn().mockResolvedValue([]),
    };
    chatGateway = {
      getUserRoomIds: jest.fn().mockReturnValue([]),
      cancelPendingLocationUpdates: jest.fn(),
      server: { to: jest.fn().mockReturnThis(), emit: jest.fn() } as any,
    };

    mapService = new MapService(
      usersService as UsersService,
      mapRepository as MapRepository,
      chatGateway as ChatGateway,
    );
  });

  describe('authorizedObserverIds', () => {
    it('includes shared-room participants and mutual contacts', async () => {
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'contact-1',
      ]);
      (usersService.findMutualContactIds as jest.Mock).mockResolvedValue([
        { toString: () => 'contact-2' },
      ]);

      const result = await mapService.authorizedObserverIds('viewer');

      expect(result.has('contact-1')).toBe(true);
      expect(result.has('contact-2')).toBe(true);
    });

    it('excludes users blocked by the viewer', async () => {
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'blocked-user',
        'ok-user',
      ]);
      (usersService.getBlockedUserIds as jest.Mock).mockResolvedValue([
        'blocked-user',
      ]);

      const result = await mapService.authorizedObserverIds('viewer');

      expect(result.has('blocked-user')).toBe(false);
      expect(result.has('ok-user')).toBe(true);
    });

    it('excludes users who blocked the viewer', async () => {
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'blocker',
        'ok-user',
      ]);
      (mapRepository.getUsersWhoBlocked as jest.Mock).mockResolvedValue([
        'blocker',
      ]);

      const result = await mapService.authorizedObserverIds('viewer');

      expect(result.has('blocker')).toBe(false);
      expect(result.has('ok-user')).toBe(true);
    });

    it('never includes the viewer themself', async () => {
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'viewer',
      ]);

      const result = await mapService.authorizedObserverIds('viewer');

      expect(result.has('viewer')).toBe(false);
    });
  });

  describe('getVisibleUsers (SC-001/008)', () => {
    it('returns nothing for a non-contact (unauthorized) target', async () => {
      // No shared rooms, no mutual contacts => empty authorized set.
      const result = await mapService.getVisibleUsers('viewer');
      expect(result).toEqual([]);
      expect(usersService.findManyByIds).not.toHaveBeenCalled();
    });

    it('excludes ghost-mode users, users with no location, and users who stopped sharing', async () => {
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'ghost-user',
        'no-location-user',
        'stopped-sharing-user',
        'visible-user',
      ]);
      (usersService.findManyByIds as jest.Mock).mockResolvedValue([
        {
          _id: 'ghost-user',
          isGhostMode: true,
          isSharingLocation: true,
          location: { coordinates: [1, 1] },
        },
        {
          _id: 'no-location-user',
          isGhostMode: false,
          isSharingLocation: true,
          location: undefined,
        },
        {
          _id: 'stopped-sharing-user',
          isGhostMode: false,
          isSharingLocation: false,
          location: { coordinates: [2, 2] },
        },
        {
          _id: 'visible-user',
          name: 'Visible',
          isGhostMode: false,
          isSharingLocation: true,
          isOnline: true,
          location: { coordinates: [31.2, 30.05] },
          locationUpdatedAt: new Date('2026-06-21T00:00:00.000Z'),
        },
      ]);

      const result = await mapService.getVisibleUsers('viewer');

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('visible-user');
    });
  });

  describe('getNearbyUsers (SC-001/006) — scoped to the authorized set', () => {
    it('passes only the viewer-authorized ids through to the geospatial query', async () => {
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'contact-1',
      ]);

      await mapService.getNearbyUsers('viewer', 31.2, 30.05, 10);

      expect(usersService.getNearbyUsers).toHaveBeenCalledWith(
        'viewer',
        31.2,
        30.05,
        10,
        ['contact-1'],
      );
    });

    it('queries with an empty authorized set when the viewer has no contacts (never returns strangers)', async () => {
      await mapService.getNearbyUsers('viewer', 31.2, 30.05, 10);

      expect(usersService.getNearbyUsers).toHaveBeenCalledWith(
        'viewer',
        31.2,
        30.05,
        10,
        [],
      );
    });
  });

  describe('getExploreUsers — coarse location for non-contacts (FR-001b)', () => {
    it('returns precise coordinates for an authorized contact', async () => {
      (mapRepository.getActiveShowOnMapAuthorIds as jest.Mock).mockResolvedValue([
        'author-1',
      ]);
      (mapRepository.getSharedRoomParticipantIds as jest.Mock).mockResolvedValue([
        'author-1',
      ]);
      (usersService.findManyByIds as jest.Mock).mockResolvedValue([
        {
          _id: 'author-1',
          name: 'Author',
          isOnline: true,
          location: { coordinates: [31.219734, 30.062612] },
          locationUpdatedAt: new Date('2026-06-21T00:00:00.000Z'),
        },
      ]);

      const result = await mapService.getExploreUsers('viewer');

      expect(result[0].isCoarse).toBeUndefined();
      expect(result[0].location.coordinates).toEqual([31.219734, 30.062612]);
    });

    it('truncates coordinates to ~2 decimal places for a non-contact', async () => {
      (mapRepository.getActiveShowOnMapAuthorIds as jest.Mock).mockResolvedValue([
        'stranger-1',
      ]);
      // Not in the viewer's authorized set (no shared rooms / mutuals).
      (usersService.findManyByIds as jest.Mock).mockResolvedValue([
        {
          _id: 'stranger-1',
          name: 'Stranger',
          isOnline: false,
          location: { coordinates: [31.219734, 30.062612] },
          locationUpdatedAt: new Date('2026-06-21T00:00:00.000Z'),
        },
      ]);

      const result = await mapService.getExploreUsers('viewer');

      expect(result[0].isCoarse).toBe(true);
      expect(result[0].location.coordinates).toEqual([31.21, 30.06]);
    });
  });

  describe('setGhostMode (FR-011/012)', () => {
    it('emits locationHidden to every room the user shares', async () => {
      (chatGateway.getUserRoomIds as jest.Mock).mockReturnValue([
        'room-1',
        'room-2',
      ]);

      await mapService.setGhostMode('user-1', true);

      expect(usersService.setGhostMode).toHaveBeenCalledWith('user-1', true);
      expect(chatGateway.server!.to).toHaveBeenCalledWith('room-1');
      expect(chatGateway.server!.to).toHaveBeenCalledWith('room-2');
      expect(chatGateway.server!.emit).toHaveBeenCalledWith('locationHidden', {
        userId: 'user-1',
      });
    });

    it('cancels any not-yet-flushed batch entry when enabling Ghost Mode', async () => {
      await mapService.setGhostMode('user-1', true);

      expect(chatGateway.cancelPendingLocationUpdates).toHaveBeenCalledWith('user-1');
    });

    it('re-broadcasts the last known location when disabling Ghost Mode', async () => {
      (chatGateway.getUserRoomIds as jest.Mock).mockReturnValue(['room-1']);
      (usersService.findById as jest.Mock).mockResolvedValue({
        location: { coordinates: [31.2, 30.05] },
        locationUpdatedAt: new Date('2026-06-21T00:00:00.000Z'),
        isOnline: true,
      });

      await mapService.setGhostMode('user-1', false);

      expect(chatGateway.server!.emit).toHaveBeenCalledWith(
        'locationUpdate',
        expect.objectContaining({
          updates: [expect.objectContaining({ userId: 'user-1' })],
        }),
      );
    });
  });
});
