# Merge conflict resolution: `026-kids-allowance-watch` → `test/merge-026-kids-allowance-watch`

| | |
|---|---|
| Merge commit | `ff49b63` |
| Source branch | `026-kids-allowance-watch` (`6d6c003`) |
| Target branch | `test/merge-026-kids-allowance-watch` (`efb7f77`, PR #7 merged) |
| Merge base | `bb0bf2e` (restructure: moved ciro-fuel modules to ciro-fuel directory) |

## Why there were conflicts

The two branches made incompatible changes to the same module.

- **026** (`9799ae0`) deletes the old Ciro Fuel wallet module, `src/modules/ciro-fuel/wallets/`.
  It is replaced by the shared ledger wallet in `src/modules/wallet/`. Old balances move into the ledger through
  `src/scripts/migrate-fuel-wallets.ts`.
- **PR #7** (`adc9e9c`, queued wallet-backed payment processing) extends that same module.
  It adds `reservedBalance`, `paymentReservations`, and the methods that hold and settle funds.
  `CiroFuelPaymentsService` calls them through `WalletsService`.

If we had taken 026's deletion as-is, PR #7's payment code would no longer compile.
If we had kept PR #7's version as-is, both wallet modules would have mapped `GET /wallet/me`.

## Resolution rule

- **Internals follow PR #7.** We keep the old wallet storage, because fuel payments need it.
- **HTTP routes follow 026.** We remove the old wallet controller, because 026 deliberately replaced `GET /wallet/me` (FR-026).

## Conflict-by-conflict

| File | Conflict type | Resolution | Why |
|---|---|---|---|
| `src/app.module.ts` | content | Kept both sides | Both added new modules in the same place. See [below](#srcappmodulets). |
| `src/modules/ciro-fuel/wallets/schemas/wallet.schema.ts` | deleted in 026, modified in PR #7 | **Kept** (PR #7 version) | Holds `reservedBalance` and `paymentReservations`, which fuel payments use |
| `src/modules/ciro-fuel/wallets/wallets.repository.ts` | deleted in 026, modified in PR #7 | **Kept** (PR #7 version) | `reservePayment`, `settlePayment` and `releasePayment`, used by payments |
| `src/modules/ciro-fuel/wallets/wallets.service.ts` | deleted in 026, modified in PR #7 | **Kept** (PR #7 version) | Injected into `CiroFuelPaymentsService` |
| `src/modules/ciro-fuel/wallets/wallets.service.spec.ts` | deleted in 026, modified in PR #7 | **Kept** (PR #7 version) | Tests for the kept service |
| `src/modules/ciro-fuel/wallets/wallets.controller.ts` | deleted in 026, modified in PR #7 | **Deleted** (026) | Its `GET /wallet/me` collides with the ledger `WalletController` (see below) |
| `src/modules/ciro-fuel/wallets/wallets.controller.spec.ts` | deleted in 026, modified in PR #7 | **Deleted** (026) | Tests a controller that no longer exists |
| `src/modules/ciro-fuel/wallets/dto/wallet-response.dto.ts` | deleted in 026, modified in PR #7 | **Deleted** (026) | Used only by the deleted controller |
| `src/modules/ciro-fuel/wallets/wallets.module.ts` | deleted cleanly by 026 (PR #7 did not touch it) | **Restored and edited**: no controllers | `CiroFuelTransactionsModule` imports it for `WalletsService` |

`src/modules/ciro-fuel/wallets/wallets.repository.spec.ts` was new in PR #7 and did not conflict. It is kept.

All other files merged automatically.

### `GET /wallet/me` route collision

Both controllers used `@Controller('wallet')` + `@Get('me')`, with different response bodies:

| | Old Ciro Fuel `WalletsController` (PR #7) | Ledger `WalletController` (026) |
|---|---|---|
| Response | `{ balance, reservedBalance, availableBalance, currency }` | `{ accountId, balanceHalalas, currency, frozen }` |
| Source of truth | old `wallets` collection | `ledger_accounts` |

NestJS does not report duplicate routes. It serves whichever controller registers first. Here that is the old one, because
`CiroFuelTransactionsModule` comes before `WalletModule` in `app.module.ts`. 026's endpoint would have been
silently unreachable, and `test/allowance.e2e-spec.ts` and `test/ledger-invariants.e2e-spec.ts` call it.

**Behavior change for the Fuel app:** `GET /wallet/me` now returns the ledger response.
If the Fuel app still needs `reservedBalance` or `availableBalance`, add a separate route
(for example under `ciro-fuel/`) instead of bringing back the duplicate.

### `src/modules/ciro-fuel/wallets/wallets.module.ts`

The module was restored from the PR #7 side with its controller removed:

```ts
/**
 * Legacy Ciro Fuel wallet, kept only as the backing store for
 * CiroFuelPaymentsService (reserve/settle). It exposes no HTTP routes:
 * GET /wallet/me is served by the shared ledger (src/modules/wallet, 026 FR-026).
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Wallet.name, schema: WalletSchema }]),
  ],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService],
})
export class WalletsModule {}
```

It is **not** imported in `app.module.ts`, matching 026's change.
It is loaded only through `CiroFuelTransactionsModule`.

### `src/app.module.ts`

Both sides added module imports at the same place. The resolution keeps both:

```ts
// imports
import { CiroFuelTransactionsModule } from './modules/ciro-fuel/ciro-fuel-transactions/ciro-fuel-transactions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';         // PR #7
import { OpsAlertModule } from './common/ops-alert/ops-alert.module';                    // 026
import { devModules } from './dev-modules';                                              // 026
import { WalletModule } from './modules/wallet/wallet.module';                           // 026
import { FamilyCoreModule } from './modules/family-core/family-core.module';             // 026
import { CardsModule } from './modules/cards/cards.module';                              // 026
import { FamilyModule } from './modules/family/family.module';                           // 026
import { AllowanceModule } from './modules/allowance/allowance.module';                  // 026
import { AllowanceRequestsModule } from './modules/allowance-requests/allowance-requests.module'; // 026

// @Module({ imports: [...] })
    CiroFuelTransactionsModule,
    TransactionsModule,            // PR #7

    // Kids allowance (specs/026-kids-allowance-watch)
    WalletModule,
    FamilyCoreModule,
    CardsModule,
    FamilyModule,
    AllowanceModule,
    AllowanceRequestsModule,
    ...DEV_MODULES,
```

## Verification

Run on the merged tree (`ff49b63`):

| Check | Result |
|---|---|
| Duplicate HTTP routes (scan of all `*.controller.ts`) | None |
| Unit tests (`jest`) | 72/72 suites, 632/632 tests passed. Includes `ciro-fuel-payments.service.spec`, `wallets.service.spec` and `wallets.repository.spec` |
| E2E tests (`jest --config test/jest-e2e.json`) | 6/7 suites, 141/141 tests passed |
| Type check (`tsc --noEmit`) | 3 errors, all from older commits (see below) |

Failures that come from older commits, not from this merge. Each file is identical on both parent branches:

- `test/app.e2e-spec.ts`: Jest cannot parse the file. It is the original NestJS scaffold test and has not changed since the first commit.
- `src/modules/chat/chat.service.spec.ts` (2 errors): `SendMessageDto` now requires `clientMessageId`.
- `src/modules/translation/services/translation-manager.service.spec.ts` (1 error): the mock handler is missing `onCreditsLow` and `onCreditsExhausted`.

## Follow-ups before retiring the old wallet collection

1. **Port `CiroFuelPaymentsService` onto `LedgerService`.** Fuel payments still read and write the old `wallets` collection.
   Running `migrate-fuel-wallets.ts --retire-legacy` renames that collection to `legacy_fuel_wallets_<YYYYMMDD>`.
   After that, fuel payments break until they run on the ledger.
2. **Make the migration account for held funds.** `migrate-fuel-wallets.ts` copies only `balance`. It ignores PR #7's
   `reservedBalance` and `paymentReservations`. In PR #7, `balance` still includes held money until `settlePayment`
   subtracts it. So if a payment is held when the migration runs and settles afterwards against the old collection,
   the ledger keeps money that has already been paid out. Either run the migration only when no payments are held,
   or migrate holds as ledger holds.
3. **Decide what the Fuel app reads for its wallet** (see [the route collision](#get-walletme-route-collision)).
4. **Once 1 and 2 are done**, delete `src/modules/ciro-fuel/wallets/` entirely, as 026 originally intended.
