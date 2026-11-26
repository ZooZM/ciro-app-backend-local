import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LedgerHealthService } from './ledger-health.service';
import { WalletService } from './wallet.service';

interface AuthedRequest {
  user: { userId: string };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly health: LedgerHealthService,
  ) {}

  /** FR-026: the acting user's real Ciro wallet balance; created on first call. */
  @Get('me')
  async me(@Request() req: AuthedRequest) {
    this.health.assertAvailable();
    const account = await this.wallet.getOrCreateUserWallet(req.user.userId);
    return {
      accountId: account._id.toString(),
      balanceHalalas: account.balanceHalalas,
      currency: 'SAR',
      frozen: account.frozen,
    };
  }
}
