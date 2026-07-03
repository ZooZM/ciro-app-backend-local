"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SightengineModerationProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SightengineModerationProvider = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const fs_1 = require("fs");
const form_data_1 = __importDefault(require("form-data"));
const VIDEO_MODELS = 'nudity-2.1,offensive-2.0';
const TEXT_MODELS = 'nudity_sexual_content';
const FLAG_THRESHOLD = 0.5;
let SightengineModerationProvider = SightengineModerationProvider_1 = class SightengineModerationProvider {
    httpService;
    configService;
    logger = new common_1.Logger(SightengineModerationProvider_1.name);
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
    }
    async analyze(videoPath, description) {
        const apiUser = this.configService.get('SIGHTENGINE_API_USER');
        const apiSecret = this.configService.get('SIGHTENGINE_API_SECRET');
        if (!apiUser || !apiSecret) {
            throw new Error('SIGHTENGINE_API_USER/SIGHTENGINE_API_SECRET are not configured');
        }
        const videoFlagged = await this.checkVideo(videoPath, apiUser, apiSecret);
        if (videoFlagged) {
            this.logger.log(`Video flagged by Sightengine: ${videoFlagged.join(', ')}`);
            return {
                verdict: 'flagged',
                flaggedSource: 'video',
                categories: videoFlagged,
                providerRef: 'sightengine-video',
            };
        }
        if (description.trim().length > 0) {
            const textFlagged = await this.checkText(description, apiUser, apiSecret);
            if (textFlagged) {
                this.logger.log(`Description flagged by Sightengine: ${textFlagged.join(', ')}`);
                return {
                    verdict: 'flagged',
                    flaggedSource: 'description',
                    categories: textFlagged,
                    providerRef: 'sightengine-text',
                };
            }
        }
        return { verdict: 'clean', providerRef: 'sightengine' };
    }
    async checkVideo(videoPath, apiUser, apiSecret) {
        const form = new form_data_1.default();
        form.append('media', (0, fs_1.createReadStream)(videoPath));
        form.append('models', VIDEO_MODELS);
        form.append('api_user', apiUser);
        form.append('api_secret', apiSecret);
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post('https://api.sightengine.com/1.0/video/check-sync.json', form, { headers: form.getHeaders() }));
        const flagged = new Set();
        for (const frame of response.data.data?.frames ?? []) {
            if ((frame.nudity?.sexual_activity ?? 0) >= FLAG_THRESHOLD) {
                flagged.add('nudity');
            }
            if ((frame.offensive?.prob ?? 0) >= FLAG_THRESHOLD) {
                flagged.add('offensive');
            }
        }
        return flagged.size > 0 ? [...flagged] : null;
    }
    async checkText(description, apiUser, apiSecret) {
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.get('https://api.sightengine.com/1.0/text/check.json', {
            params: {
                text: description,
                mode: 'standard',
                models: TEXT_MODELS,
                api_user: apiUser,
                api_secret: apiSecret,
            },
        }));
        const matches = response.data.nudity?.matches ?? [];
        return matches.length > 0 ? ['nudity_sexual_content'] : null;
    }
};
exports.SightengineModerationProvider = SightengineModerationProvider;
exports.SightengineModerationProvider = SightengineModerationProvider = SightengineModerationProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], SightengineModerationProvider);
//# sourceMappingURL=sightengine.provider.js.map