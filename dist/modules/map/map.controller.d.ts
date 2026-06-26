import { MapService } from './map.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { NearbyUsersDto } from './dto/nearby-users.dto';
import { SetGhostModeDto } from './dto/set-ghost-mode.dto';
export declare class MapController {
    private readonly mapService;
    constructor(mapService: MapService);
    updateLocation(req: any, updateLocationDto: UpdateLocationDto): Promise<{
        message: string;
    }>;
    getNearbyUsers(req: any, query: NearbyUsersDto): Promise<{
        users: import("./map.service").MapUserDto[];
    }>;
    getVisibleUsers(req: any): Promise<{
        users: import("./map.service").MapUserDto[];
    }>;
    getExploreUsers(req: any): Promise<{
        users: import("./map.service").MapUserDto[];
    }>;
    getGroups(req: any): Promise<{
        groups: {
            id: any;
            name: any;
            memberCount: any;
            avatarUrl: any;
            initials: any;
        }[];
    }>;
    setGhostMode(req: any, dto: SetGhostModeDto): Promise<{
        isGhostMode: boolean;
    }>;
    getGhostMode(req: any): Promise<{
        isGhostMode: boolean;
    }>;
}
