import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Body,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StatusService } from './status.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { ReactStatusDto } from './dto/react-status.dto';
import { ReplyStatusDto } from './dto/reply-status.dto';

const STATUS_UPLOAD_DIR = './uploads/status';

@UseGuards(JwtAuthGuard)
@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Get('feed')
  async getFeed(@Request() req: any) {
    return this.statusService.getFeed(req.user.userId);
  }

  @Get('audience/default')
  async getDefaultAudience(@Request() req: any) {
    return this.statusService.getDefaultAudience(req.user.userId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(STATUS_UPLOAD_DIR, { recursive: true });
          cb(null, STATUS_UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB hard cap
      fileFilter: (_req, file, cb) => {
        const allowed = /^(image|audio|video)\/.+$/;
        if (allowed.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(`Unsupported file type: ${file.mimetype}`),
            false,
          );
        }
      },
    }),
  )
  async uploadStatus(
    @Request() req: any,
    @Body() dto: CreateStatusDto,
    @Res({ passthrough: true }) res: Response,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const { status, isNew } = await this.statusService.createStatus(
      req.user.userId,
      dto,
      file,
    );
    res.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return status;
  }

  @Get(':id/viewers')
  async getViewers(@Request() req: any, @Param('id') id: string) {
    return this.statusService.getViewers(id, req.user.userId);
  }

  @Get(':id/reactions')
  async getReactions(@Request() req: any, @Param('id') id: string) {
    return this.statusService.getReactions(id, req.user.userId);
  }

  @Post(':id/react')
  @HttpCode(HttpStatus.OK)
  async react(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ReactStatusDto,
  ) {
    return this.statusService.react(id, req.user.userId, dto);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  async reply(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ReplyStatusDto,
  ) {
    return this.statusService.reply(id, req.user.userId, dto);
  }

  @Get('media/:statusId/:filename')
  async getMedia(
    @Request() req: any,
    @Param('statusId') statusId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const status = await this.statusService.getStatusForMediaAccess(
      statusId,
      req.user.userId,
    );

    const filePath = join(process.cwd(), 'uploads', 'status', filename);
    if (!existsSync(filePath)) throw new NotFoundException();

    res.set({
      'Content-Type': status.mimeType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    });
    res.sendFile(filePath);
  }
}
