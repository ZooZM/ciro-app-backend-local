import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MapService } from './map.service';
import { UpdateLocationDto } from './dto/update-location.dto';
import { NearbyUsersDto } from './dto/nearby-users.dto';
import { SetGhostModeDto } from './dto/set-ghost-mode.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Patch('location')
  async updateLocation(
    @Request() req: any,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    const { userId } = req.user;
    const { longitude, latitude } = updateLocationDto;

    await this.mapService.updateLocation(userId, longitude, latitude);

    return { message: 'Location updated successfully' };
  }

  @Get('nearby')
  async getNearbyUsers(@Request() req: any, @Query() query: NearbyUsersDto) {
    const { userId } = req.user;
    const { longitude, latitude, radius } = query;

    const users = await this.mapService.getNearbyUsers(
      userId,
      longitude,
      latitude,
      radius || 10,
    );

    return { users };
  }

  /** Full authorized set (non-distance-limited) — "All Locations" filter (FR-018). */
  @Get('visible')
  async getVisibleUsers(@Request() req: any) {
    const { userId } = req.user;
    const users = await this.mapService.getVisibleUsers(userId);
    return { users };
  }

  /** Explore tab: SHOW_ON_MAP statuses, coarse for non-contacts (FR-001a/b). */
  @Get('explore')
  async getExploreUsers(@Request() req: any) {
    const { userId } = req.user;
    const users = await this.mapService.getExploreUsers(userId);
    return { users };
  }

  /** The caller's GROUP chat rooms, for the group filter (FR-017/023). */
  @Get('groups')
  async getGroups(@Request() req: any) {
    const { userId } = req.user;
    const groups = await this.mapService.getGroups(userId);
    return { groups };
  }

  @Patch('ghost-mode')
  async setGhostMode(@Request() req: any, @Body() dto: SetGhostModeDto) {
    const { userId } = req.user;
    return this.mapService.setGhostMode(userId, dto.enabled);
  }

  @Get('ghost-mode')
  async getGhostMode(@Request() req: any) {
    const { userId } = req.user;
    return this.mapService.getGhostMode(userId);
  }
}
