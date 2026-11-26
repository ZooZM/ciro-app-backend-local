import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    throw new BadRequestException({
      message: 'Idempotency-Key header must be a UUID v4',
      error: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  }
  return value.toLowerCase();
}

/**
 * 026 (contracts/rest-api.md "Idempotency"): money routes without a natural
 * key need `Idempotency-Key: <uuid v4>`; a retry with the same key returns
 * the original result because the ledger key is unique.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return parseIdempotencyKey(request.headers['idempotency-key']);
  },
);
