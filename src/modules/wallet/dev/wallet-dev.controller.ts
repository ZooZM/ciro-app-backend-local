import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NonProductionGuard } from '../../../common/guards/non-production.guard';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { IdempotencyKey } from '../../../common/decorators/idempotency-key.decorator';
import { WalletService } from '../wallet.service';
import { ReconciliationService } from '../reconciliation.service';
import { EntryType } from '../schemas/ledger-entry.schema';
import { AccountFrozenError } from '../ledger.errors';
import { SimulateTopUpDto } from './simulate-top-up.dto';

interface AuthedRequest {
  user: { userId: string };
}

/**
 * [DEV] 026 (FR-061): simulated funding of the acting user's wallet. Only
 * registered when NODE_ENV !== 'production'; JWT + admin key required.
 */
@Controller('dev/wallet')
@UseGuards(JwtAuthGuard, NonProductionGuard, AdminKeyGuard)
export class WalletDevController {
  constructor(
    private readonly wallet: WalletService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  /** Runs the ledger reconciliation (R15) right away, across all accounts. */
  @Post('reconciliation/run')
  @HttpCode(HttpStatus.OK)
  async runReconciliation() {
    const report = await this.reconciliation.run();
    return { reportId: report._id.toString(), status: report.status };
  }

  @Post('simulate/top-up')
  @HttpCode(HttpStatus.OK)
  async simulateTopUp(
    @Request() req: AuthedRequest,
    @IdempotencyKey() key: string,
    @Body() dto: SimulateTopUpDto,
  ) {
    const userId = req.user.userId;
    const funding = await this.wallet.getSystemAccount('simulation_funding');
    try {
      return await this.wallet.runInTransaction(async (session) => {
        const account = await this.wallet.getOrCreateUserWallet(
          userId,
          session,
        );
        const { entry } = await this.wallet.transfer(
          {
            type: EntryType.SIMULATED_FUNDING,
            fromAccountId: funding,
            toAccountId: account._id,
            amountHalalas: dto.amountHalalas,
            idempotencyKey: `simfund:${key}`,
            initiator: {
              kind: 'simulation',
              userId: new Types.ObjectId(userId),
            },
          },
          session,
        );
        return {
          entryId: entry._id.toString(),
          balanceHalalas: await this.wallet.getBalance(account._id, session),
        };
      });
    } catch (err) {
      if (err instanceof AccountFrozenError) {
        throw new ConflictException({
          message: 'This wallet is frozen while the account is a linked child',
          error: 'ACCOUNT_FROZEN',
        });
      }
      throw err;
    }
  }
}
