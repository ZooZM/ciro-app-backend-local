import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AllowanceService } from './allowance.service';
import { UpdateAllowanceSettingsDto } from './dto/update-allowance-settings.dto';
import { ListActivityQuery } from './dto/list-activity.query';
import { AmountDto } from './dto/amount.dto';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { ActivityFeedService } from './activity-feed.service';
import { PayoutsService } from './payouts.service';

interface AuthedRequest {
  user: { userId: string };
}

/**
 * 026 contracts/rest-api.md "Allowance". Parent routes take `{childId}`;
 * child routes use `me`. There is no child route that writes settings (FR-007).
 */
@Controller('allowance')
@UseGuards(JwtAuthGuard)
export class AllowanceController {
  constructor(
    private readonly allowance: AllowanceService,
    private readonly activity: ActivityFeedService,
    private readonly payouts: PayoutsService,
  ) {}

  @Get('children/:childId/summary')
  childSummary(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
  ) {
    return this.allowance.getChildSummary(req.user.userId, childId);
  }

  @Get('me/summary')
  mySummary(@Request() req: AuthedRequest) {
    return this.allowance.getMySummary(req.user.userId);
  }

  @Get('children/:childId/settings')
  childSettings(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
  ) {
    return this.allowance.getSettings(req.user.userId, childId);
  }

  @Get('me/settings')
  mySettings(@Request() req: AuthedRequest) {
    return this.allowance.getMySettings(req.user.userId);
  }

  @Get('children/:childId/transactions')
  childTransactions(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
    @Query() query: ListActivityQuery,
  ) {
    return this.activity.forParent(req.user.userId, childId, query);
  }

  @Get('me/transactions')
  myTransactions(
    @Request() req: AuthedRequest,
    @Query() query: ListActivityQuery,
  ) {
    return this.activity.forChild(req.user.userId, query);
  }

  @Post('children/:childId/top-ups')
  @HttpCode(HttpStatus.OK)
  topUp(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
    @IdempotencyKey() key: string,
    @Body() dto: AmountDto,
  ) {
    return this.allowance.topUp(
      req.user.userId,
      childId,
      dto.amountHalalas,
      key,
    );
  }

  @Post('children/:childId/pull-backs')
  @HttpCode(HttpStatus.OK)
  pullBack(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
    @IdempotencyKey() key: string,
    @Body() dto: AmountDto,
  ) {
    return this.allowance.pullBack(
      req.user.userId,
      childId,
      dto.amountHalalas,
      key,
    );
  }

  @Post('children/:childId/payouts/:payoutId/pay')
  @HttpCode(HttpStatus.OK)
  payNow(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
    @Param('payoutId') payoutId: string,
  ) {
    return this.payouts.payNow(req.user.userId, childId, payoutId);
  }

  @Put('children/:childId/settings')
  updateSettings(
    @Request() req: AuthedRequest,
    @Param('childId') childId: string,
    @Body() dto: UpdateAllowanceSettingsDto,
  ) {
    return this.allowance.updateSettings(req.user.userId, childId, dto);
  }
}
