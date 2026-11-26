import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import mongoose, { Connection, Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  apply,
  dryRun,
  legacyCollectionName,
  retire,
  verify,
} from '../src/scripts/migrate-fuel-wallets';
import { startReplSet } from './helpers/replset';

/**
 * 026 (T240, R16, FR-025, SC-011): the migration script against a real replica
 * set — dry-run, apply (re-runnable), verify, and retire only after a pass.
 */
describe('Fuel wallet migration (e2e)', () => {
  let repl: MongoMemoryReplSet;
  let conn: Connection;
  const owners = [
    new Types.ObjectId(),
    new Types.ObjectId(),
    new Types.ObjectId(),
  ];
  const dir = mkdtempSync(join(tmpdir(), 'fuel-migration-'));

  beforeAll(async () => {
    repl = await startReplSet();
    conn = await mongoose.createConnection(repl.getUri()).asPromise();
    await conn.db!.collection('wallets').insertMany([
      { ownerId: owners[0], balance: 15_000, currency: 'SAR' },
      { ownerId: owners[1], balance: 250, currency: 'SAR' },
      { ownerId: owners[2], balance: 0, currency: 'SAR' },
    ]);
  }, 120_000);

  afterAll(async () => {
    await conn?.close();
    await repl?.stop();
  });

  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const balances = async () => {
    const rows = await conn
      .db!.collection('ledger_accounts')
      .find({ kind: 'user_wallet' })
      .toArray();
    return new Map(
      rows.map((r) => [String(r.ownerUserId), r.balanceHalalas as number]),
    );
  };

  it('verify fails before anything was applied, and retire refuses', async () => {
    const report = await verify(conn, join(dir, 'before.json'));
    expect(report.ok).toBe(false);
    expect(report.differences.map((d) => d.problem)).toEqual([
      'opening_entry_missing',
      'opening_entry_missing',
    ]);
    await expect(
      retire(conn, join(dir, 'retire-refused.json')),
    ).rejects.toThrow(/verification failed/);
    expect(
      await conn.db!.listCollections({ name: 'wallets' }).toArray(),
    ).toHaveLength(1);
  });

  it('dry-run reports the count and the total without writing', async () => {
    await dryRun(conn);
    expect(log.mock.calls.flat().join('\n')).toContain(
      'total: 15250 halalas (152.50 SAR)',
    );
    expect(await conn.db!.collection('ledger_entries').countDocuments({})).toBe(
      0,
    );
  });

  it('apply posts one opening entry per wallet with a balance, and is safe to re-run', async () => {
    await apply(conn);
    const b = await balances();
    expect(b.get(String(owners[0]))).toBe(15_000);
    expect(b.get(String(owners[1]))).toBe(250);
    expect(b.has(String(owners[2]))).toBe(false); // zero balance: nothing to migrate
    expect(
      await conn
        .db!.collection('ledger_entries')
        .countDocuments({ type: 'migration_opening' }),
    ).toBe(2);

    await apply(conn);
    expect(
      await conn
        .db!.collection('ledger_entries')
        .countDocuments({ type: 'migration_opening' }),
    ).toBe(2);
    expect((await balances()).get(String(owners[0]))).toBe(15_000);
    expect(log.mock.calls.flat().join('\n')).toContain(
      'already migrated (skipped): 2',
    );
  });

  it('verify passes and writes a JSON report', async () => {
    const path = join(dir, 'after.json');
    const report = await verify(conn, path);
    expect(report).toMatchObject({
      ok: true,
      legacyWallets: 3,
      legacyTotalHalalas: 15_250,
      openingTotalHalalas: 15_250,
    });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      ok: true,
      differences: [],
    });
  });

  it('verify catches a later difference (the shared wallet dropped below the legacy balance)', async () => {
    await conn
      .db!.collection('ledger_accounts')
      .updateOne(
        { kind: 'user_wallet', ownerUserId: owners[1] },
        { $set: { balanceHalalas: 100 } },
      );
    const report = await verify(conn, join(dir, 'drift.json'));
    expect(report.ok).toBe(false);
    expect(report.differences[0]).toMatchObject({
      problem: 'shared_balance_below_legacy',
    });
    await conn
      .db!.collection('ledger_accounts')
      .updateOne(
        { kind: 'user_wallet', ownerUserId: owners[1] },
        { $set: { balanceHalalas: 250 } },
      );
  });

  it('retire renames the legacy collection only after a passing verify', async () => {
    await retire(conn, join(dir, 'retire.json'));
    expect(
      await conn.db!.listCollections({ name: 'wallets' }).toArray(),
    ).toHaveLength(0);
    const renamed = legacyCollectionName();
    expect(await conn.db!.collection(renamed).countDocuments({})).toBe(3);
  });

  it('aborts on a legacy balance that is not an integer', async () => {
    await conn.db!.collection('wallets').insertOne({
      ownerId: new Types.ObjectId(),
      balance: 12.5,
      currency: 'SAR',
    });
    await expect(dryRun(conn)).rejects.toThrow(/not a non-negative integer/);
    await expect(apply(conn)).rejects.toThrow(/not a non-negative integer/);
  });
});
