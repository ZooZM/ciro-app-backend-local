import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { UsersModule } from '../users/users.module';
import { TranslationGateway } from './translation.gateway';
import { TranslationController } from './translation.controller';
import { TranslationStateService } from './services/translation-state.service';
import { TranslationService } from './services/translation.service';
import { CaptionDispatchService } from './services/caption-dispatch.service';
import { SpeechPipelineService } from './services/speech-pipeline.service';
import { TranslationManagerService } from './services/translation-manager.service';
import { BillingTickerService } from './services/billing-ticker.service';
import { SpeakerLanguageCache } from './services/language-detection.util';
import {
  TranslationUsage,
  TranslationUsageSchema,
} from './schemas/translation-usage.schema';
import { TranslationUsageRepository } from './repositories/translation-usage.repository';
import { googleSpeechClientProvider } from './providers/google-speech.provider';
import { googleTranslateClientProvider } from './providers/google-translate.provider';
import { LiveKitRtcProvider } from './providers/livekit-rtc.provider';
import {
  TRANSLATION_CONFIG,
  translationConfigFactory,
} from './translation.config';

/**
 * On-Demand Real-time Video Call Translation (specs/001-realtime-call-translation).
 *
 * v1 pinned-worker stance (T015a, analysis A1): see {@link TranslationGateway}
 * for the full rationale. `TRANSLATION_CONFIG.workerRole` identifies this
 * instance's role; pipeline ownership is arbitrated via Redis
 * (`xlation:owner:{room}:{speaker}`, see translation-state.service.ts).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TranslationUsage.name, schema: TranslationUsageSchema },
    ]),
    ConfigModule,
    AuthModule,
    ChatModule,
    UsersModule,
  ],
  controllers: [TranslationController],
  providers: [
    TranslationGateway,
    TranslationStateService,
    TranslationService,
    CaptionDispatchService,
    SpeechPipelineService,
    TranslationManagerService,
    BillingTickerService,
    SpeakerLanguageCache,
    TranslationUsageRepository,
    LiveKitRtcProvider,
    googleSpeechClientProvider,
    googleTranslateClientProvider,
    {
      provide: TRANSLATION_CONFIG,
      useFactory: translationConfigFactory,
      inject: [ConfigService],
    },
  ],
})
export class TranslationModule {}
