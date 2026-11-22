import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WalletResponseDto } from './dto/wallet-response.dto';
import { WalletsService } from './wallets.service';

interface AuthenticatedRequest {
  user: { userId: string };
}

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('me')
  async getMyWallet(
    @Request() req: AuthenticatedRequest,
  ): Promise<WalletResponseDto> {
    const wallet = await this.walletsService.getMyWallet(req.user.userId);
    const reservedBalance = wallet.reservedBalance ?? 0;
    return {
      balance: wallet.balance,
      reservedBalance,
      availableBalance: wallet.balance - reservedBalance,
      currency: wallet.currency,
    };
  }
}
