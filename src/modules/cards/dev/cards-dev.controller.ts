import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { NonProductionGuard } from '../../../common/guards/non-production.guard';
import { AdminKeyGuard } from '../../../common/guards/admin-key.guard';
import { FamilyAccessService } from '../../family-core/family-access.service';
import { ChildSummaryService } from '../../family-core/child-summary.service';
import { CardsRepository } from '../../family-core/repositories/cards.repository';
import { CardTransactionsRepository } from '../../family-core/repositories/card-transactions.repository';
import { FamilyLinkDocument } from '../../family-core/schemas/family-link.schema';
import { childNotFound } from '../../family-core/allowance-errors';
import { CardEventsService } from '../card-events.service';
import { SimulatePurchaseDto, SimulateRefundDto } from './simulate-card.dto';

interface AuthedRequest {
  user: { userId: string };
}

/**
 * [DEV] 026 (FR-060–062): simulated card events. Only registered when
 * NODE_ENV !== 'production'; JWT + admin key required. Events go through
 * `CardEventsService.handle()` exactly like an issuer's would.
 */
@Controller('dev/cards')
@UseGuards(JwtAuthGuard, NonProductionGuard, AdminKeyGuard)
export class CardsDevController {
  constructor(
    private readonly events: CardEventsService,
    private readonly access: FamilyAccessService,
    private readonly summaries: ChildSummaryService,
    private readonly cards: CardsRepository,
    private readonly cardTransactions: CardTransactionsRepository,
  ) {}

  @Post('simulate/purchase')
  @HttpCode(HttpStatus.OK)
  async purchase(
    @Request() req: AuthedRequest,
    @Body() dto: SimulatePurchaseDto,
  ) {
    const link = await this.resolveTarget(req.user.userId, dto.childId);
    const card = await this.cards.findByLinkId(link._id);
    if (!card) throw new NotFoundException('No card');
    const outcome = await this.events.handle(
      {
        kind: 'authorization_request',
        issuerTxnId: `sim_${randomUUID()}`,
        cardRef: card.cardRef,
        amountHalalas: dto.amountHalalas,
        merchantName: dto.merchantName,
        category: dto.category,
        occurredAt: new Date(),
      },
      'simulation',
    );
    if (outcome.kind !== 'authorization_request')
      throw new BadRequestException();
    return {
      transactionId: outcome.result.transactionId,
      outcome: outcome.result.outcome,
      declineReason: outcome.result.declineReason ?? null,
      summary: await this.summaries.getSummaryForLink(link),
    };
  }

  @Post('simulate/refund')
  @HttpCode(HttpStatus.OK)
  async refund(@Request() req: AuthedRequest, @Body() dto: SimulateRefundDto) {
    const link = await this.resolveTarget(req.user.userId, dto.childId);
    const original = await this.cardTransactions.findById(
      dto.originalTransactionId,
    );
    if (!original || !original.childUserId.equals(link.childUserId))
      throw childNotFound();
    const card = await this.cards.findByLinkId(link._id);
    if (!card) throw new NotFoundException('No card');
    const outcome = await this.events.handle(
      {
        kind: 'refund',
        issuerTxnId: `sim_${randomUUID()}`,
        cardRef: card.cardRef,
        originalIssuerTxnId: original.issuerTxnId,
        amountHalalas: dto.amountHalalas,
        merchantName: original.merchantName,
        occurredAt: new Date(),
      },
      'simulation',
    );
    if (outcome.kind !== 'refund') throw new BadRequestException();
    return {
      transactionId: outcome.result.transactionId,
      creditedTo: outcome.result.creditedTo,
      summary: await this.summaries.getSummaryForLink(link),
    };
  }

  /** A linked child uses their own card; a parent names one of their children. */
  private async resolveTarget(
    actorId: string,
    childId?: string,
  ): Promise<FamilyLinkDocument> {
    if (childId) return this.access.assertParentOf(actorId, childId);
    return this.access.assertLinkedChild(actorId).catch(() => {
      throw new BadRequestException(
        'childId is required when acting as a parent',
      );
    });
  }
}
