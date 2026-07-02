import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReelsService } from './reels.service';
import { CommentsQueryDto, FeedQueryDto } from './dto/feed-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Get()
  getFeed(@Request() req: any, @Query() query: FeedQueryDto) {
    return this.reelsService.getFeed(req.user.userId, query);
  }

  @Get(':id')
  getReel(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.getReel(id, req.user.userId);
  }

  @Post(':id/like')
  toggleLike(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.toggleLike(id, req.user.userId);
  }

  @Get(':id/comments')
  getComments(@Param('id') id: string, @Query() query: CommentsQueryDto) {
    return this.reelsService.getComments(id, query);
  }

  @Post(':id/comments')
  addComment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.reelsService.addComment(id, req.user.userId, dto.text);
  }

  @Post(':id/share')
  recordShare(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.recordShare(id, req.user.userId);
  }
}
