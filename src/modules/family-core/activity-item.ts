import type {
  ActivityKind,
  DeclineReason,
  SpendingCategory,
} from './family-core.constants';
import type { InitiatorKind } from '../wallet/schemas/ledger-entry.schema';

/** contracts/rest-api.md `ActivityItem` — one row of the child's activity list. */
export interface ActivityItemDto {
  id: string;
  occurredAt: string;
  kind: ActivityKind;
  /** Child's perspective; `none` = no money moved. */
  direction: 'in' | 'out' | 'none';
  amountHalalas: number;
  currency: 'SAR';
  merchantName: string | null;
  category: SpendingCategory | null;
  declineReason: DeclineReason | null;
  requestId: string | null;
  payoutId: string | null;
  note: string | null;
  initiator: InitiatorKind;
}
