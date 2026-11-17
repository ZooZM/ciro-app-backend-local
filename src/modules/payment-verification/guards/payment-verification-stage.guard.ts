import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentVerificationStatus } from '../enum/payment-verification-status.enum';
import { PaymentVerificationService } from '../payment-verification.service';

const REQUIRED_STATUS_KEY = 'paymentVerificationRequiredStatus';

export const RequiresStatus = (status: PaymentVerificationStatus) =>
  SetMetadata(REQUIRED_STATUS_KEY, status);

@Injectable()
export class PaymentVerificationStageGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly paymentVerificationService: PaymentVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expected = this.reflector.get<PaymentVerificationStatus>(
      REQUIRED_STATUS_KEY,
      context.getHandler(),
    );
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<{
      user: { userId: string };
      params: { id: string };
    }>();
    await this.paymentVerificationService.assertStage(
      req.params.id,
      req.user.userId,
      expected,
    );
    return true;
  }
}
