import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/** contracts/rest-api.md "Pagination": opaque cursor, newest first, limit 1..100 (default 30). */
export interface Cursor {
  createdAt: Date;
  id: Types.ObjectId;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const DEFAULT_PAGE_LIMIT = 30;
export const MAX_PAGE_LIMIT = 100;

export function encodeCursor(
  createdAt: Date,
  id: Types.ObjectId | string,
): string {
  return Buffer.from(`${createdAt.getTime()}:${id.toString()}`).toString(
    'base64url',
  );
}

export function decodeCursor(cursor?: string | null): Cursor | undefined {
  if (!cursor) return undefined;
  const raw = Buffer.from(cursor, 'base64url').toString();
  const [ms, id] = raw.split(':');
  if (!ms || !id || !/^\d+$/.test(ms) || !Types.ObjectId.isValid(id)) {
    throw new BadRequestException({
      message: 'Invalid cursor',
      error: 'Bad Request',
    });
  }
  return { createdAt: new Date(Number(ms)), id: new Types.ObjectId(id) };
}

export function clampLimit(limit?: number | string | null): number {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}

/** Mongo filter for "older than the cursor" with a stable `_id` tiebreak. */
export function beforeCursor(
  cursor?: Cursor,
  field = 'createdAt',
): Record<string, unknown> {
  if (!cursor) return {};
  return {
    $or: [
      { [field]: { $lt: cursor.createdAt } },
      { [field]: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  };
}

export function oid(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}
