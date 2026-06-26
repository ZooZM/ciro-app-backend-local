"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGoogleClientAuthOptions = resolveGoogleClientAuthOptions;
function resolveGoogleClientAuthOptions(configService) {
    const projectId = configService.get('GOOGLE_PROJECT_ID');
    const credentialsJson = configService.get('GOOGLE_APPLICATION_CREDENTIALS_JSON');
    const keyFilename = configService.get('GOOGLE_APPLICATION_CREDENTIALS');
    const options = {};
    if (projectId)
        options.projectId = projectId;
    if (credentialsJson) {
        options.credentials = JSON.parse(credentialsJson);
    }
    else if (keyFilename) {
        options.keyFilename = keyFilename;
    }
    return options;
}
//# sourceMappingURL=google-credentials.util.js.map