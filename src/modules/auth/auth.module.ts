import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthSession, AuthSessionSchema } from './schemas/auth-session.schema';
import { AuthSessionsRepository } from './auth-sessions.repository';
import {
  FamilyLink,
  FamilyLinkSchema,
} from '../family-core/schemas/family-link.schema';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    NotificationsModule,
    // 026: registers the schemas it needs directly. It must NOT import
    // FamilyCoreModule (FamilyCore → Chat → Auth would be a module cycle).
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: FamilyLink.name, schema: FamilyLinkSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'default-secret',
        // Dynamic expiration will be handled per token in service, but we can set a fallback
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  providers: [AuthService, JwtStrategy, AuthSessionsRepository],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, AuthSessionsRepository],
})
export class AuthModule {}
