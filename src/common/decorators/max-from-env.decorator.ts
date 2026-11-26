import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Like `@Max()`, but the bound is read from `process.env[envKey]` at
 * validation time, so it honours `.env` values loaded by ConfigModule after
 * DTO classes were decorated (026: ALLOWANCE_MAX_*_HALALAS).
 */
export function MaxFromEnv(
  envKey: string,
  fallback: number,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'maxFromEnv',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must not be greater than ${envKey}`,
        ...options,
      },
      validator: {
        validate(value: unknown) {
          const max = Number(process.env[envKey]) || fallback;
          return typeof value === 'number' && value <= max;
        },
      },
    });
  };
}

export function envInt(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export const MAX_AMOUNT_ENV = 'ALLOWANCE_MAX_AMOUNT_HALALAS';
export const MAX_AMOUNT_DEFAULT = 1_000_000;
export const MAX_REQUEST_ENV = 'ALLOWANCE_MAX_REQUEST_HALALAS';
export const MAX_REQUEST_DEFAULT = 50_000;
