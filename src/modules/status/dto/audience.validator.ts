import {
  registerDecorator,
  isMongoId,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that the decorated property, when present, is an array of
 * MongoDB ObjectId-format strings (used for `CreateStatusDto.audience`).
 */
export function IsAudienceArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAudienceArray',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined) return true;
          if (!Array.isArray(value)) return false;
          return value.every(
            (entry) => typeof entry === 'string' && isMongoId(entry),
          );
        },
        defaultMessage() {
          return `${propertyName} must be an array of valid user IDs`;
        },
      },
    });
  };
}
