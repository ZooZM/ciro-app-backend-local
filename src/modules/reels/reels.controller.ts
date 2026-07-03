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
import { SearchQueryDto } from './dto/search-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  // NOTE: static routes (liked/saved/search) MUST stay above the `:id`
  // routes below — NestJS matches in declaration order, and `:id` would
  // otherwise swallow these paths (e.g. GET /api/reels/liked -> getReel('liked')).

  @Get('liked')
  getLiked(@Request() req: any, @Query() query: FeedQueryDto) {
    return this.reelsService.getLiked(req.user.userId, query);
  }

  @Get('saved')
  getSaved(@Request() req: any, @Query() query: FeedQueryDto) {
    return this.reelsService.getSaved(req.user.userId, query);
  }

  @Get('search')
  searchReels(@Request() req: any, @Query() query: SearchQueryDto) {
    return this.reelsService.searchReels(req.user.userId, query);
  }

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
  getComments(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: CommentsQueryDto,
  ) {
    return this.reelsService.getComments(id, req.user.userId, query);
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

  @Post(':id/view')
  recordView(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.recordView(id, req.user.userId);
  }

  @Post(':id/save')
  toggleSave(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.toggleSave(id, req.user.userId);
  }
}
