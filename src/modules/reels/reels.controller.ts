import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { parseFile } from 'music-metadata';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReelsService } from './reels.service';
import { CommentsQueryDto, FeedQueryDto } from './dto/feed-query.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateReelDto } from './dto/create-reel.dto';
import { SearchQueryDto } from './dto/search-query.dto';

const REELS_UPLOAD_DIR = './uploads/reels';
// FR-060: 100 MB Multer cap (higher than the chat/status 20 MB cap — video).
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
// FR-060a: 60s cap + 1s tolerance for container-duration rounding.
const MAX_DURATION_SECONDS = 61;

type UploadFiles = {
  video?: Express.Multer.File[];
  thumbnail?: Express.Multer.File[];
};

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

  // v3 (FR-060): upload a new reel — video (required, ≤60s) + optional
  // thumbnail + description. Created as `pending_moderation`; the upload
  // response never waits on the moderation verdict (FR-062).
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, file, cb) => {
            const sub = file.fieldname === 'thumbnail' ? 'thumbs' : 'videos';
            const dir = `${REELS_UPLOAD_DIR}/${sub}`;
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
          },
          filename: (_req, file, cb) => {
            cb(null, `${randomUUID()}${extname(file.originalname)}`);
          },
        }),
        limits: { fileSize: MAX_VIDEO_BYTES },
        fileFilter: (_req, file, cb) => {
          const allowed =
            file.fieldname === 'thumbnail'
              ? /^image\/(jpeg|png)$/
              : /^video\/(mp4|quicktime|webm)$/;
          if (allowed.test(file.mimetype)) {
            cb(null, true);
          } else {
            cb(
              new BadRequestException(`Unsupported file type: ${file.mimetype}`),
              false,
            );
          }
        },
      },
    ),
  )
  async uploadReel(
    @Request() req: any,
    @Body() dto: CreateReelDto,
    @UploadedFiles() files: UploadFiles,
  ) {
    const videoFile = files.video?.[0];
    const thumbnailFile = files.thumbnail?.[0];
    if (!videoFile) {
      await this.cleanupFiles([thumbnailFile]);
      throw new BadRequestException('A video file is required');
    }

    try {
      await this.assertWithinDurationCap(videoFile.path);
    } catch (err) {
      // FR-060: no partial/phantom reel on any upload failure.
      await this.cleanupFiles([videoFile, thumbnailFile]);
      throw err;
    }

    return this.reelsService.createReel({
      creatorId: req.user.userId,
      videoUrl: `/uploads/reels/videos/${videoFile.filename}`,
      thumbnailUrl: thumbnailFile
        ? `/uploads/reels/thumbs/${thumbnailFile.filename}`
        : '',
      description: dto.description ?? '',
    });
  }

  @Delete(':id')
  deleteReel(@Request() req: any, @Param('id') id: string) {
    return this.reelsService.deleteReel(id, req.user.userId);
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

  /**
   * FR-060a: server-side duration enforcement (never trust the client
   * alone). Pinned to `music-metadata@7.x` (last CommonJS-published major —
   * v8+ is pure ESM, which needs a dynamic `import()` that Jest's default
   * CJS test runtime can't execute without extra flags).
   */
  private async assertWithinDurationCap(videoPath: string): Promise<void> {
    let durationSeconds: number | undefined;
    try {
      const meta = await parseFile(videoPath);
      durationSeconds = meta.format.duration;
    } catch {
      throw new BadRequestException('Could not read the video duration');
    }
    if (durationSeconds === undefined || !Number.isFinite(durationSeconds)) {
      throw new BadRequestException('Could not read the video duration');
    }
    if (durationSeconds > MAX_DURATION_SECONDS) {
      throw new BadRequestException(
        `Video exceeds the ${MAX_DURATION_SECONDS - 1}-second limit`,
      );
    }
  }

  private async cleanupFiles(
    files: (Express.Multer.File | undefined)[],
  ): Promise<void> {
    for (const file of files) {
      if (!file) continue;
      try {
        await unlink(file.path);
      } catch {
        // Best-effort — a missing file must never block the error response.
      }
    }
  }
}
