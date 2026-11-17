import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';

/**
 * Deletes the uploaded file when anything fails after multer saved it
 * (invalid body rejected by ValidationPipe, a service error, etc.).
 * Must be listed BEFORE FileInterceptor so it wraps it.
 */
@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<{ file?: Express.Multer.File }>();

    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          from(this.removeFile(req.file)).pipe(
            mergeMap(() => throwError(() => error)),
          ),
        ),
      );
  }

  private async removeFile(file?: Express.Multer.File): Promise<void> {
    if (!file?.path) return;
    await unlink(file.path).catch(() => undefined);
  }
}
