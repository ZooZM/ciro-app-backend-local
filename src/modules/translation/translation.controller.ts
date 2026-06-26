import { Controller, Get, Inject, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsersRepository } from '../users/users.repository';
import { TranslationUsageRepository } from './repositories/translation-usage.repository';
import { TRANSLATION_CONFIG } from './translation.config';
import type { TranslationConfig } from './translation.config';

interface BalanceResponse {
  remainingSeconds: number;
  remainingMinutes: number;
  tier: string;
  status: string;
  lowBalanceThresholdSeconds: number;
}

interface ActiveSessionResponse {
  roomId: string;
  speakerId: string;
  targetLanguage: string;
  startedAt: Date;
  secondsConsumed: number;
}

/**
 * Read-only client-UX endpoints backing translation gating/restoration
 * (contracts/rest-endpoints.md). Subscription lifecycle stays on
 * {@link TranslationGateway} — nothing here opens a pipeline or stream.
 */
@UseGuards(JwtAuthGuard)
@Controller('translation')
export class TranslationController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly translationUsageRepository: TranslationUsageRepository,
    @Inject(TRANSLATION_CONFIG) private readonly config: TranslationConfig,
  ) {}

  /** GET /translation/balance — remaining credits for client gating/UX (FR-021). */
  @Get('balance')
  async getBalance(
    @Request() req: { user: { userId: string } },
  ): Promise<BalanceResponse> {
    const subscription =
      await this.usersRepository.getTranslationSubscriptionInfo(
        req.user.userId,
      );

    return {
      remainingSeconds: subscription.translationSecondsBalance,
      remainingMinutes: Math.floor(subscription.translationSecondsBalance / 60),
      tier: subscription.tier,
      status: subscription.status,
      lowBalanceThresholdSeconds: this.config.lowBalanceSeconds,
    };
  }

  /** GET /translation/sessions/active — caller's active sessions for UI restoration after reconnect. */
  @Get('sessions/active')
  async getActiveSessions(
    @Request() req: { user: { userId: string } },
  ): Promise<ActiveSessionResponse[]> {
    const sessions = await this.translationUsageRepository.findActiveSessions(
      req.user.userId,
    );

    return sessions.map((session) => ({
      roomId: session.roomId,
      speakerId: session.speakerId,
      targetLanguage: session.targetLanguage,
      startedAt: session.startedAt,
      secondsConsumed: session.secondsConsumed,
    }));
  }
}
