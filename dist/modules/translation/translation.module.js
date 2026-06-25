"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const auth_module_1 = require("../auth/auth.module");
const chat_module_1 = require("../chat/chat.module");
const users_module_1 = require("../users/users.module");
const translation_gateway_1 = require("./translation.gateway");
const translation_controller_1 = require("./translation.controller");
const translation_state_service_1 = require("./services/translation-state.service");
const translation_service_1 = require("./services/translation.service");
const caption_dispatch_service_1 = require("./services/caption-dispatch.service");
const speech_pipeline_service_1 = require("./services/speech-pipeline.service");
const translation_manager_service_1 = require("./services/translation-manager.service");
const billing_ticker_service_1 = require("./services/billing-ticker.service");
const language_detection_util_1 = require("./services/language-detection.util");
const translation_usage_schema_1 = require("./schemas/translation-usage.schema");
const translation_usage_repository_1 = require("./repositories/translation-usage.repository");
const google_speech_provider_1 = require("./providers/google-speech.provider");
const google_translate_provider_1 = require("./providers/google-translate.provider");
const livekit_rtc_provider_1 = require("./providers/livekit-rtc.provider");
const translation_config_1 = require("./translation.config");
let TranslationModule = class TranslationModule {
};
exports.TranslationModule = TranslationModule;
exports.TranslationModule = TranslationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: translation_usage_schema_1.TranslationUsage.name, schema: translation_usage_schema_1.TranslationUsageSchema },
            ]),
            config_1.ConfigModule,
            auth_module_1.AuthModule,
            chat_module_1.ChatModule,
            users_module_1.UsersModule,
        ],
        controllers: [translation_controller_1.TranslationController],
        providers: [
            translation_gateway_1.TranslationGateway,
            translation_state_service_1.TranslationStateService,
            translation_service_1.TranslationService,
            caption_dispatch_service_1.CaptionDispatchService,
            speech_pipeline_service_1.SpeechPipelineService,
            translation_manager_service_1.TranslationManagerService,
            billing_ticker_service_1.BillingTickerService,
            language_detection_util_1.SpeakerLanguageCache,
            translation_usage_repository_1.TranslationUsageRepository,
            livekit_rtc_provider_1.LiveKitRtcProvider,
            google_speech_provider_1.googleSpeechClientProvider,
            google_translate_provider_1.googleTranslateClientProvider,
            {
                provide: translation_config_1.TRANSLATION_CONFIG,
                useFactory: translation_config_1.translationConfigFactory,
                inject: [config_1.ConfigService],
            },
        ],
    })
], TranslationModule);
//# sourceMappingURL=translation.module.js.map