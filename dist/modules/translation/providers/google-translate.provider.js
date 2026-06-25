"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleTranslateClientProvider = exports.GOOGLE_TRANSLATE_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const translate_1 = require("@google-cloud/translate");
const google_credentials_util_1 = require("./google-credentials.util");
exports.GOOGLE_TRANSLATE_CLIENT = 'GOOGLE_TRANSLATE_CLIENT';
exports.googleTranslateClientProvider = {
    provide: exports.GOOGLE_TRANSLATE_CLIENT,
    useFactory: (configService) => {
        return new translate_1.v3.TranslationServiceClient((0, google_credentials_util_1.resolveGoogleClientAuthOptions)(configService));
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=google-translate.provider.js.map