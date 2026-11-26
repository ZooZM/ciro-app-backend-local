import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { Types } from 'mongoose';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NonProductionGuard } from '../../../common/guards/non-production.guard';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { FamilyLinksRepository } from '../../family-core/repositories/family-links.repository';
import { Injectable } from '@nestjs/common';
import { PayoutsService } from '../payouts.service';
import { AllowanceRequestsService } from '../../allowance-requests/allowance-requests.service';

class RunJobDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;
}

interface AuthedRequest {
  user: { userId: string };
}

/** Dev-only jobs beyond payouts and reminders. */
@Injectable()
export class AllowanceDevJobs {
  constructor(private readonly requests: AllowanceRequestsService) {}

  /** `request-expiry`: expires this family's overdue pending requests as of `asOf`. */
  async run(
    job: string,
    asOf: Date,
    childIds: Types.ObjectId[],
  ): Promise<number | null> {
    if (job === 'request-expiry')
      return this.requests.expireOverdue(asOf, childIds);
    return null;
  }
}

/**
 * [DEV] 026: runs a scheduled job right now as if the time were `asOf`, so QA
 * does not wait for 06:00 Riyadh. It only touches the acting user's own
 * family (as parent or as child). Only registered outside production.
 */
@Controller('dev/allowance')
@UseGuards(JwtAuthGuard, NonProductionGuard, AdminKeyGuard)
export class AllowanceDevController {
  constructor(
    private readonly payouts: PayoutsService,
    private readonly links: FamilyLinksRepository,
    private readonly extra: AllowanceDevJobs,
  ) {}

  @Post('jobs/:job/run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Request() req: AuthedRequest,
    @Param('job') job: string,
    @Body() dto: RunJobDto,
  ) {
    const actor = new Types.ObjectId(req.user.userId);
    const asOf = dto.asOf ? new Date(dto.asOf) : new Date();
    const family = await this.links.findAllActive({ parentIds: [actor] });
    const own = await this.links.findActiveByChild(req.user.userId);
    const childIds = [
      ...family.map((l) => l.childUserId),
      ...(own ? [own.childUserId] : []),
    ];

    if (job === 'payouts') {
      const due = await this.payouts.findDue(asOf, { childIds });
      let processed = 0;
      for (const d of due) {
        const r = await this.payouts.payOne(d.childId, d.month, asOf);
        if (r.status !== 'skipped') processed++;
      }
      return { processed };
    }
    if (job === 'reminders') {
      return {
        processed: await this.payouts.runReminders(asOf, {
          parentIds: [actor],
        }),
      };
    }
    const handled = await this.extra.run(job, asOf, childIds);
    if (handled === null) throw new BadRequestException(`Unknown job ${job}`);
    return { processed: handled };
  }
}
