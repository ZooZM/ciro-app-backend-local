"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleSpeechClientProvider = exports.GOOGLE_SPEECH_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const speech_1 = require("@google-cloud/speech");
const google_credentials_util_1 = require("./google-credentials.util");
exports.GOOGLE_SPEECH_CLIENT = 'GOOGLE_SPEECH_CLIENT';
exports.googleSpeechClientProvider = {
    provide: exports.GOOGLE_SPEECH_CLIENT,
    useFactory: (configService) => {
        return new speech_1.v1.SpeechClient((0, google_credentials_util_1.resolveGoogleClientAuthOptions)(configService));
    },
    inject: [config_1.ConfigService],
};
//# sourceMappingURL=google-speech.provider.js.map