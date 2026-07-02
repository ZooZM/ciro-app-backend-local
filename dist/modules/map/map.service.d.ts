import { UsersService } from '../users/users.service';
import { MapRepository } from './map.repository';
import { ChatGateway } from '../chat/chat.gateway';
export interface MapUserDto {
    _id: string;
    name: string;
    phoneNumber: string;
    avatarUrl?: string;
    isOnline: boolean;
    location: {
        type: 'Point';
        coordinates: [number, number];
    };
    locationUpdatedAt: string;
    sharedGroupIds: string[];
    isCoarse?: boolean;
    hasActiveStatus?: boolean;
}
export declare function coarsen(value: number): number;
export declare class MapService {
    private readonly usersService;
    private readonly mapRepository;
    private readonly chatGateway;
    constructor(usersService: UsersService, mapRepository: MapRepository, chatGateway: ChatGateway);
    updateLocation(userId: string, lng: number, lat: number): Promise<Date>;
    authorizedObserverIds(userId: string): Promise<Set<string>>;
    getVisibleUsers(viewerId: string): Promise<MapUserDto[]>;
    getNearbyUsers(userId: string, lng: number, lat: number, maxDistanceKm: number): Promise<MapUserDto[]>;
    getExploreUsers(viewerId: string): Promise<MapUserDto[]>;
    getGroups(userId: string): Promise<{
        id: any;
        name: any;
        memberCount: any;
        avatarUrl: any;
        initials: any;
    }[]>;
    setGhostMode(userId: string, enabled: boolean): Promise<{
        isGhostMode: boolean;
    }>;
    getGhostMode(userId: string): Promise<{
        isGhostMode: boolean;
    }>;
    private toMapUserDto;
}
