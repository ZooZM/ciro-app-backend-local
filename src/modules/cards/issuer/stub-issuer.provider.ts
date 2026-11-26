import { Injectable, NotImplementedException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import {
  AuthorizationDecisionResult,
  IssuedCard,
  IssuerEvent,
  IssuerProvider,
} from './issuer-provider';

/**
 * 026 (research R6): simulated card issuer. It has no webhooks; the dev
 * simulator calls `CardEventsService.handle()` directly, so simulated and
 * real purchases share every rule and record (FR-060).
 */
@Injectable()
export class StubIssuerProvider implements IssuerProvider {
  readonly name = 'stub' as const;

  issueCard(): Promise<IssuedCard> {
    return Promise.resolve({
      cardRef: `stub_${randomUUID()}`,
      last4: randomInt(0, 10_000).toString().padStart(4, '0'),
    });
  }

  freezeCard(): Promise<void> {
    return Promise.resolve();
  }

  unfreezeCard(): Promise<void> {
    return Promise.resolve();
  }

  terminateCard(): Promise<void> {
    return Promise.resolve();
  }

  parseWebhook(): IssuerEvent {
    throw new NotImplementedException('The stub issuer has no webhooks');
  }

  formatAuthorizationResponse(result: AuthorizationDecisionResult): unknown {
    return result;
  }
}
