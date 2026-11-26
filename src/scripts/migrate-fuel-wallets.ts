/**
 * 026 (research R16, FR-024/025, SC-011): moves the Ciro Fuel `wallets`
 * documents into the shared ledger as opening balances, verifies the result,
 * and only then retires the legacy collection.
 *
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-fuel-wallets.ts <mode>
 *
 * Modes (use exactly one):
 *   --dry-run        count the legacy wallets and total them; abort on a non-integer balance
 *   --apply          post one `migration_opening` entry per wallet with balance > 0 (re-runnable)
 *   --verify         compare the ledger with the legacy data; write a JSON report; exit 1 on any difference
 *   --retire-legacy  rename `wallets` to `legacy_fuel_wallets_<YYYYMMDD>`; only after a passing verify
 *
 * Reads MONGODB_URI from the environment. BEFORE --apply, the Fuel team must
 * confirm that legacy balances are in halalas (assumed from Fuel's `toCents`).
 */
import { writeFileSync } from 'fs';
import mongoose, { Connection, Types } from 'mongoose';
import {
  LedgerAccount,
  LedgerAccountSchema,
} from '../modules/wallet/schemas/ledger-account.schema';
import {
  EntryType,
  LedgerEntry,
  LedgerEntrySchema,
} from '../modules/wallet/schemas/ledger-entry.schema';
import { LedgerAccountsRepository } from '../modules/wallet/repositories/ledger-accounts.repository';
import { LedgerEntriesRepository } from '../modules/wallet/repositories/ledger-entries.repository';
import { LedgerHealthService } from '../modules/wallet/ledger-health.service';
import { LedgerService } from '../modules/wallet/ledger.service';
import { WalletService } from '../modules/wallet/wallet.service';

export type Mode = 'dry-run' | 'apply' | 'verify' | 'retire-legacy';

export interface LegacyWallet {
  _id: Types.ObjectId | string;
  ownerId: Types.ObjectId | string;
  balance: number;
}

export interface OpeningEntry {
  idempotencyKey: string;
  amountHalalas: number;
  creditAccountOwner?: string;
}

export interface Difference {
  walletId: string;
  ownerId: string;
  problem:
    | 'opening_entry_missing'
    | 'opening_total_differs'
    | 'shared_balance_below_legacy';
  legacyHalalas: number;
  openingHalalas: number;
  sharedBalanceHalalas: number;
}

export interface VerifyReport {
  ok: boolean;
  legacyWallets: number;
  legacyTotalHalalas: number;
  openingTotalHalalas: number;
  differences: Difference[];
  checkedAt: string;
}

export const MODES: Mode[] = ['dry-run', 'apply', 'verify', 'retire-legacy'];

export function parseMode(argv: string[]): Mode {
  const flags = argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2));
  const modes = flags.filter((f): f is Mode => (MODES as string[]).includes(f));
  if (modes.length !== 1 || flags.length !== 1) {
    throw new Error(
      `Pass exactly one of: ${MODES.map((m) => `--${m}`).join(', ')}`,
    );
  }
  return modes[0];
}

/** Abort rather than migrate a balance that is not a whole number of halalas. */
export function assertIntegerBalances(wallets: LegacyWallet[]): void {
  const bad = wallets.filter(
    (w) => !Number.isSafeInteger(w.balance) || w.balance < 0,
  );
  if (bad.length > 0) {
    throw new Error(
      `Aborting: ${bad.length} legacy wallet(s) have a balance that is not a non-negative integer ` +
        `(first: ${String(bad[0]._id)} = ${bad[0].balance}). Confirm the unit with the Fuel team first.`,
    );
  }
}

export const openingKey = (walletId: Types.ObjectId | string) =>
  `fuel-migration:${String(walletId)}`;

/**
 * Pure comparison. For each legacy wallet with a balance: its opening entry
 * must exist and equal the legacy balance exactly, and the owner's shared
 * wallet must hold at least that much (it may hold more: other money).
 */
export function verifyMigration(
  legacy: LegacyWallet[],
  openings: OpeningEntry[],
  sharedBalanceByOwner: Map<string, number>,
  now = new Date(),
): VerifyReport {
  const openingByKey = new Map(
    openings.map((o) => [o.idempotencyKey, o.amountHalalas]),
  );
  const differences: Difference[] = [];
  let legacyTotal = 0;

  for (const w of legacy) {
    legacyTotal += w.balance;
    if (w.balance <= 0) continue;
    const opening = openingByKey.get(openingKey(w._id));
    const shared = sharedBalanceByOwner.get(String(w.ownerId)) ?? 0;
    const base = {
      walletId: String(w._id),
      ownerId: String(w.ownerId),
      legacyHalalas: w.balance,
      openingHalalas: opening ?? 0,
      sharedBalanceHalalas: shared,
    };
    if (opening === undefined)
      differences.push({ ...base, problem: 'opening_entry_missing' });
    else if (opening !== w.balance)
      differences.push({ ...base, problem: 'opening_total_differs' });
    else if (shared < w.balance)
      differences.push({ ...base, problem: 'shared_balance_below_legacy' });
  }

  const openingTotal = openings.reduce((sum, o) => sum + o.amountHalalas, 0);
  const expectedOpeningTotal = legacy
    .filter((w) => w.balance > 0)
    .reduce((sum, w) => sum + w.balance, 0);
  if (openingTotal !== expectedOpeningTotal && differences.length === 0) {
    differences.push({
      walletId: '*',
      ownerId: '*',
      problem: 'opening_total_differs',
      legacyHalalas: expectedOpeningTotal,
      openingHalalas: openingTotal,
      sharedBalanceHalalas: 0,
    });
  }
  return {
    ok: differences.length === 0,
    legacyWallets: legacy.length,
    legacyTotalHalalas: legacyTotal,
    openingTotalHalalas: openingTotal,
    differences,
    checkedAt: now.toISOString(),
  };
}

export function legacyCollectionName(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `legacy_fuel_wallets_${y}${m}${d}`;
}

// ───────────────────────────── runtime ─────────────────────────────

async function readLegacy(conn: Connection): Promise<LegacyWallet[]> {
  const docs = await conn.db!.collection('wallets').find({}).toArray();
  return docs.map((d) => ({
    _id: d._id,
    ownerId: d.ownerId,
    balance: d.balance as number,
  }));
}

function services(conn: Connection) {
  const accountModel = conn.model(LedgerAccount.name, LedgerAccountSchema);
  const entryModel = conn.model(LedgerEntry.name, LedgerEntrySchema);
  const accounts = new LedgerAccountsRepository(accountModel as never);
  const entries = new LedgerEntriesRepository(entryModel as never);
  const health = new LedgerHealthService(conn, {
    alert: () => Promise.resolve(),
  } as never);
  const ledger = new LedgerService(conn, health, accounts, entries);
  return {
    accountModel,
    entryModel,
    health,
    wallet: new WalletService(ledger, accounts, health),
  };
}

export async function dryRun(conn: Connection): Promise<void> {
  const legacy = await readLegacy(conn);
  assertIntegerBalances(legacy);
  const withBalance = legacy.filter((w) => w.balance > 0);
  const total = withBalance.reduce((s, w) => s + w.balance, 0);
  console.log(
    `legacy wallets: ${legacy.length}; with a balance: ${withBalance.length}; total: ${total} halalas (${(total / 100).toFixed(2)} SAR)`,
  );
}

export async function apply(conn: Connection): Promise<void> {
  const legacy = await readLegacy(conn);
  assertIntegerBalances(legacy);
  const { wallet, health } = services(conn);
  if (!(await health.check()))
    throw new Error(
      'MongoDB is not a replica set; the ledger cannot run transactions',
    );
  const source = await wallet.getSystemAccount('fuel_migration');
  let applied = 0;
  let skipped = 0;
  for (const w of legacy.filter((x) => x.balance > 0)) {
    const result = await wallet.runInTransaction(async (session) => {
      const owner = await wallet.getOrCreateUserWallet(
        String(w.ownerId),
        session,
      );
      return wallet.transfer(
        {
          type: EntryType.MIGRATION_OPENING,
          fromAccountId: source,
          toAccountId: owner._id,
          amountHalalas: w.balance,
          idempotencyKey: openingKey(w._id),
          initiator: { kind: 'system' },
        },
        session,
      );
    });
    if (result.replayed) skipped++;
    else applied++;
  }
  console.log(`applied: ${applied}; already migrated (skipped): ${skipped}`);
}

export async function verify(
  conn: Connection,
  reportPath = `fuel-wallet-migration-report-${Date.now()}.json`,
): Promise<VerifyReport> {
  const legacy = await readLegacy(conn);
  assertIntegerBalances(legacy);
  const { entryModel, accountModel } = services(conn);
  const openings = (await entryModel
    .find({ type: EntryType.MIGRATION_OPENING })
    .lean()) as unknown as OpeningEntry[];
  const wallets = await accountModel.find({ kind: 'user_wallet' }).lean();
  const shared = new Map(
    wallets.map((a) => [String(a.ownerUserId), a.balanceHalalas]),
  );
  const report = verifyMigration(legacy, openings, shared);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(
    `verify ${report.ok ? 'PASSED' : 'FAILED'}: ${report.differences.length} difference(s); report: ${reportPath}`,
  );
  return report;
}

export async function retire(
  conn: Connection,
  reportPath?: string,
): Promise<void> {
  const report = await verify(conn, reportPath);
  if (!report.ok)
    throw new Error(
      'Refusing to retire the legacy collection: verification failed',
    );
  const target = legacyCollectionName();
  await conn.db!.collection('wallets').rename(target);
  console.log(`renamed wallets → ${target}`);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    if (mode === 'dry-run') await dryRun(conn);
    else if (mode === 'apply') await apply(conn);
    else if (mode === 'verify') {
      if (!(await verify(conn)).ok) process.exitCode = 1;
    } else await retire(conn);
  } finally {
    await conn.close();
  }
}

if (require.main === module) {
  main().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
