import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { createReadStream, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreatePaymentVerificationDto } from './dto/create-payment-verification.dto';
import { CreatePumpReadingDto } from './dto/create-pump-reading.dto';
import { PaymentVerificationStatus } from './enum/payment-verification-status.enum';
import {
  PaymentVerificationStageGuard,
  RequiresStatus,
} from './guards/payment-verification-stage.guard';
import { UploadCleanupInterceptor } from './interceptors/upload-cleanup.interceptor';
import {
  IMAGE_EXTENSIONS,
  PAYMENT_VERIFICATION_UPLOAD_DIR,
} from './consts/payment-verification.constants';
import { PaymentVerificationService } from './payment-verification.service';

const PAYMENT_VERIFICATION_IMAGE_INTERCEPTOR = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      mkdirSync(PAYMENT_VERIFICATION_UPLOAD_DIR, { recursive: true });
      cb(null, PAYMENT_VERIFICATION_UPLOAD_DIR);
    },
    // fileFilter has already rejected unsupported types by this point.
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_EXTENSIONS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(`Unsupported image type: ${file.mimetype}`),
        false,
      );
    }
  },
});

interface AuthenticatedRequest {
  user: { userId: string };
}

@UseGuards(JwtAuthGuard)
@Controller('payment-verification')
export class PaymentVerificationController {
  constructor(
    private readonly paymentVerificationService: PaymentVerificationService,
  ) {}

  @Post()
  start(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreatePaymentVerificationDto,
  ) {
    return this.paymentVerificationService.start(req.user.userId, dto);
  }

  @Get(':id')
  get(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.paymentVerificationService.get(id, req.user.userId);
  }

  @Get(':id/images/:type')
  async getImage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('type') type: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { path, contentType } =
      await this.paymentVerificationService.getImage(id, req.user.userId, type);
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(createReadStream(path));
  }

  // The guard runs before the interceptors, so nothing is written to disk for
  // sessions that are not the caller's, out of order, or expired.
  // UploadCleanupInterceptor is listed first so it wraps FileInterceptor and
  // removes the saved file if validation or the service fails afterwards.
  @Post(':id/dashboard-before')
  @HttpCode(HttpStatus.OK)
  @RequiresStatus(PaymentVerificationStatus.NFC_SCANNED)
  @UseGuards(PaymentVerificationStageGuard)
  @UseInterceptors(
    UploadCleanupInterceptor,
    PAYMENT_VERIFICATION_IMAGE_INTERCEPTOR,
  )
  uploadDashboardBefore(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.paymentVerificationService.uploadDashboardBefore(
      id,
      req.user.userId,
      file,
    );
  }

  @Post(':id/pump-reading')
  @HttpCode(HttpStatus.OK)
  @RequiresStatus(PaymentVerificationStatus.DASHBOARD_BEFORE_FUELING)
  @UseGuards(PaymentVerificationStageGuard)
  @UseInterceptors(
    UploadCleanupInterceptor,
    PAYMENT_VERIFICATION_IMAGE_INTERCEPTOR,
  )
  uploadPumpReading(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreatePumpReadingDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.paymentVerificationService.uploadPumpReading(
      id,
      req.user.userId,
      dto,
      file,
    );
  }

  @Post(':id/dashboard-after')
  @HttpCode(HttpStatus.OK)
  @RequiresStatus(PaymentVerificationStatus.PUMP_READING_CAPTURED)
  @UseGuards(PaymentVerificationStageGuard)
  @UseInterceptors(
    UploadCleanupInterceptor,
    PAYMENT_VERIFICATION_IMAGE_INTERCEPTOR,
  )
  uploadDashboardAfter(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.paymentVerificationService.uploadDashboardAfter(
      id,
      req.user.userId,
      file,
    );
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.paymentVerificationService.complete(id, req.user.userId);
  }
}
