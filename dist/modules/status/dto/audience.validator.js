"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IsAudienceArray = IsAudienceArray;
const class_validator_1 = require("class-validator");
function IsAudienceArray(validationOptions) {
    return function (object, propertyName) {
        (0, class_validator_1.registerDecorator)({
            name: 'isAudienceArray',
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value) {
                    if (value === undefined)
                        return true;
                    if (!Array.isArray(value))
                        return false;
                    return value.every((entry) => typeof entry === 'string' && (0, class_validator_1.isMongoId)(entry));
                },
                defaultMessage() {
                    return `${propertyName} must be an array of valid user IDs`;
                },
            },
        });
    };
}
//# sourceMappingURL=audience.validator.js.map