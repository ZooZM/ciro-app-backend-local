import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './modules/redis/redis.module';
import { ChatModule } from './modules/chat/chat.module';
import { StatusModule } from './modules/status/status.module';
import { VideoModule } from './modules/video/video.module';
import { MapModule } from './modules/map/map.module';
import { PaymentModule } from './modules/payment/payment.module';
import { TranslationModule } from './modules/translation/translation.module';
import { ReelsModule } from './modules/reels/reels.module';
import { FuelPricesModule } from './modules/fuel-prices/fuel-prices.module';
import { StationsModule } from './modules/stations/stations.module';
import { CarsModule } from './modules/cars/cars.module';
import * as Joi from 'joi';

@Module({
  imports: [
    // Configure Environment Variables Globally
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        MONGODB_URI: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        JWT_SECRET: Joi.string().required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
        LIVEKIT_API_KEY: Joi.string().required(),
        LIVEKIT_API_SECRET: Joi.string().required(),
        LIVEKIT_WS_URL: Joi.string().required(),

        // On-Demand Real-time Video Call Translation (specs/001-realtime-call-translation)
        GOOGLE_APPLICATION_CREDENTIALS: Joi.string().optional().allow(''),
        GOOGLE_APPLICATION_CREDENTIALS_JSON: Joi.string().optional().allow(''),
        GOOGLE_PROJECT_ID: Joi.string().optional().allow(''),
        TRANSLATION_PRIMARY_LANGUAGE: Joi.string().default('en-US'),
        TRANSLATION_CANDIDATE_LANGUAGES:
          Joi.string().default('ar-SA,fr-FR,es-ES'),
        TRANSLATION_INTERIM_RATE_PER_SEC: Joi.number().default(2),
        TRANSLATION_IDLE_GRACE_MS: Joi.number().default(10000),
        TRANSLATION_LOW_BALANCE_SECONDS: Joi.number().default(30),
        TRANSLATION_ACTIVATION_MIN_SECONDS: Joi.number().default(1),
        TRANSLATION_WORKER_ROLE: Joi.string().default('translation-worker'),

        // Reels content moderation (specs/021-reels-video-feed, v3 upload)
        MODERATION_PROVIDER: Joi.string()
          .valid('stub', 'sightengine')
          .default('stub'),
        SIGHTENGINE_API_USER: Joi.string().optional().allow(''),
        SIGHTENGINE_API_SECRET: Joi.string().optional().allow(''),

        // Reels reporting & reposting (specs/021-reels-video-feed, v4)
        REEL_REPORT_AUTOHIDE_THRESHOLD: Joi.number().default(25),
        REEL_REPORT_DAILY_LIMIT: Joi.number().default(20),
        ADMIN_API_KEY: Joi.string().optional().allow(''),
      }),
    }),

    // Configure Throttler Module
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: 60000,
            limit: 100, // 100 requests per minute by default
          },
        ],
        storage: new RedisThrottlerStorage(
          config.get<string>('REDIS_URL') || 'redis://localhost:6379',
        ),
      }),
    }),

    // Configure BullMQ Module
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url:
            configService.get<string>('REDIS_URL') || 'redis://localhost:6379',
          // Required by BullMQ Workers (v3 reels-moderation queue is the
          // first Worker this app runs) — blocking commands are
          // incompatible with ioredis's default per-request retry cap.
          maxRetriesPerRequest: null,
        },
      }),
    }),

    // Configure MongoDB Connection
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // Application Modules
    UsersModule,
    AuthModule,
    RedisModule,
    ChatModule,
    StatusModule,
    VideoModule,
    MapModule,
    PaymentModule,
    TranslationModule,
    ReelsModule,
    FuelPricesModule,
    StationsModule,
    CarsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
