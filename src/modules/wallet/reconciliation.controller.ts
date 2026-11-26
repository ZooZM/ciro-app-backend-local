import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../../common/guards/admin-key.guard';
import { ReconciliationService } from './reconciliation.service';

/**
 * [ADMIN] 026 (FR-022, plan Complexity Tracking #7): the one endpoint without
 * `JwtAuthGuard`. It is an operations view with no user session, guarded by
 * the admin key only, so no user token can ever reach it.
 */
@Controller('admin/ledger')
@UseGuards(AdminKeyGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Get('reconciliation')
  async reports(@Query('limit') limit?: string) {
    const items = await this.reconciliation.latest(Number(limit) || 10);
    return {
      items: items.map((r) => ({
        id: r._id.toString(),
        runAt: r.runAt,
        status: r.status,
        accountsChecked: r.accountsChecked,
        mismatches: r.mismatches.map((m) => ({
          accountId: m.accountId.toString(),
          cachedHalalas: m.cachedHalalas,
          derivedHalalas: m.derivedHalalas,
        })),
        counterRewrites: r.counterRewrites,
        checks: r.checks,
      })),
    };
  }
}
