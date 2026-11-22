import { Injectable } from '@nestjs/common';
import {
  CiroFuelTransferProvider,
  CiroFuelTransferRequest,
  CiroFuelTransferResult,
} from './payment-transfer.provider';

@Injectable()
export class MockCardTransferProvider implements CiroFuelTransferProvider {
  transfer(request: CiroFuelTransferRequest): Promise<CiroFuelTransferResult> {
    return Promise.resolve({
      providerReference: `mock-${request.idempotencyKey}`,
    });
  }
}
