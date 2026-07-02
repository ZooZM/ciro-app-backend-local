import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReelsService } from './reels.service';

@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class ReelsUsersController {
  constructor(private readonly reelsService: ReelsService) {}

  @Get(':id/profile')
  getProfile(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.getProfile(id, req.user.userId);
  }

  @Post(':id/follow')
  toggleFollow(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.toggleFollow(id, req.user.userId);
  }
}
