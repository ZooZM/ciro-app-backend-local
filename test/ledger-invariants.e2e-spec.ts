import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { OpsAlertModule } from '../src/common/ops-alert/ops-alert.module';
import { AuthModule } from '../src/modules/auth/auth.module';
import { RedisModule } from '../src/modules/redis/redis.module';
import { WalletModule } from '../src/modules/wallet/wallet.module';
import { WalletDevModule } from '../src/modules/wallet/dev/wallet-dev.module';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { LedgerEntriesRepository } from '../src/modules/wallet/repositories/ledger-entries.repository';
import {
  LedgerAccount,
  LedgerAccountDocument,
} from '../src/modules/wallet/schemas/ledger-account.schema';
import {
  EntryType,
  LedgerEntry,
  LedgerEntryDocument,
} from '../src/modules/wallet/schemas/ledger-entry.schema';
import { InsufficientBalanceError } from '../src/modules/wallet/ledger.errors';
import { bootTestApp, TEST_ADMIN_KEY, TestApp } from './helpers/replset';
import { createUser } from './helpers/users';

/**
 * 026 (T028, FR-021/022/023): randomized transfer sequences against a real
 * replica set, then the ledger invariants.
 */
describe('Ledger invariants (e2e)', () => {
  let t: TestApp;
  let wallet: WalletService;
  let accountModel: Model<LedgerAccountDocument>;
  let entryModel: Model<LedgerEntryDocument>;
  let entries: LedgerEntriesRepository;

  beforeAll(async () => {
    t = await bootTestApp({
      imports: [
        OpsAlertModule,
        RedisModule,
        AuthModule,
        WalletModule,
        WalletDevModule,
      ],
    });
    wallet = t.app.get(WalletService);
    accountModel = t.app.get(getModelToken(LedgerAccount.name));
    entryModel = t.app.get(getModelToken(LedgerEntry.name));
    entries = t.app.get(LedgerEntriesRepository);
  }, 120_000);

  afterAll(async () => {
    await t?.close();
  });

  async function assertInvariants() {
    const derived = await entries.derivedBalances();
    const all = await accountModel.find({}).lean();
    for (const acc of all) {
      expect(acc.balanceHalalas).toBe(derived.get(acc._id.toString()) ?? 0);
      if (acc.kind !== 'system')
        expect(acc.balanceHalalas).toBeGreaterThanOrEqual(0);
    }
  }

  it('keeps cached balances equal to Σcredits − Σdebits under random concurrent transfers', async () => {
    const funding = await wallet.getSystemAccount('simulation_funding');
    const users = await Promise.all(
      Array.from({ length: 4 }, () =>
        wallet.getOrCreateUserWallet(new Types.ObjectId()),
      ),
    );
    const ids = users.map((u) => u._id);

    for (const id of ids) {
      await wallet.runInTransaction((s) =>
        wallet.transfer(
          {
            type: EntryType.SIMULATED_FUNDING,
            fromAccountId: funding,
            toAccountId: id,
            amountHalalas: 10_000,
            idempotencyKey: `seed:${id.toString()}`,
            initiator: { kind: 'simulation' },
          },
          s,
        ),
      );
    }

    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };

    const ops = Array.from({ length: 60 }, (_, i) => {
      const from = ids[rand(ids.length)];
      let to = ids[rand(ids.length)];
      if (to.equals(from)) to = ids[(ids.indexOf(from) + 1) % ids.length];
      return { from, to, amount: 1 + rand(4000), key: `rand:${i}` };
    });

    const results = await Promise.allSettled(
      ops.map((op) =>
        wallet.runInTransaction((s) =>
          wallet.transfer(
            {
              type: EntryType.TOP_UP,
              fromAccountId: op.from,
              toAccountId: op.to,
              amountHalalas: op.amount,
              idempotencyKey: op.key,
              initiator: { kind: 'system' },
            },
            s,
          ),
        ),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(InsufficientBalanceError);
      }
    }
    await assertInvariants();
  }, 120_000);

  it('serializes concurrent debits on one account so it never goes below zero', async () => {
    const funding = await wallet.getSystemAccount('simulation_funding');
    const source = await wallet.getOrCreateUserWallet(new Types.ObjectId());
    const sink = await wallet.getOrCreateUserWallet(new Types.ObjectId());
    await wallet.runInTransaction((s) =>
      wallet.transfer(
        {
          type: EntryType.SIMULATED_FUNDING,
          fromAccountId: funding,
          toAccountId: source._id,
          amountHalalas: 4000,
          idempotencyKey: `seed:${source._id.toString()}`,
          initiator: { kind: 'simulation' },
        },
        s,
      ),
    );

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        wallet.runInTransaction((s) =>
          wallet.transfer(
            {
              type: EntryType.PULL_BACK,
              fromAccountId: source._id,
              toAccountId: sink._id,
              amountHalalas: 1000,
              idempotencyKey: `burst:${source._id.toString()}:${i}`,
              initiator: { kind: 'system' },
            },
            s,
          ),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    expect(await wallet.getBalance(source._id)).toBe(0);
    await assertInvariants();
  }, 120_000);

  it('replaying a key creates no new entry', async () => {
    const funding = await wallet.getSystemAccount('simulation_funding');
    const target = await wallet.getOrCreateUserWallet(new Types.ObjectId());
    const post = () =>
      wallet.runInTransaction((s) =>
        wallet.transfer(
          {
            type: EntryType.SIMULATED_FUNDING,
            fromAccountId: funding,
            toAccountId: target._id,
            amountHalalas: 777,
            idempotencyKey: `replay:${target._id.toString()}`,
            initiator: { kind: 'simulation' },
          },
          s,
        ),
      );
    const [a, b, c] = await Promise.all([post(), post(), post()]);
    expect(a.entry._id.toString()).toBe(b.entry._id.toString());
    expect(b.entry._id.toString()).toBe(c.entry._id.toString());
    expect(
      await entryModel.countDocuments({
        idempotencyKey: `replay:${target._id.toString()}`,
      }),
    ).toBe(1);
    expect(await wallet.getBalance(target._id)).toBe(777);
    await assertInvariants();
  }, 120_000);

  it('the immutability hooks throw', async () => {
    const one = await entryModel.findOne({}).exec();
    expect(one).toBeTruthy();
    await expect(
      entryModel.updateOne({ _id: one!._id }, { $set: { amountHalalas: 1 } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      entryModel.updateMany({}, { $set: { amountHalalas: 1 } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      entryModel.findOneAndUpdate(
        { _id: one!._id },
        { $set: { amountHalalas: 1 } },
      ),
    ).rejects.toThrow(/append-only/);
    await expect(entryModel.replaceOne({ _id: one!._id }, {})).rejects.toThrow(
      /append-only/,
    );
    await expect(entryModel.deleteOne({ _id: one!._id })).rejects.toThrow(
      /append-only/,
    );
    await expect(entryModel.deleteMany({})).rejects.toThrow(/append-only/);
    one!.amountHalalas = 1;
    await expect(one!.save()).rejects.toThrow(/append-only/);
  });

  it('GET /wallet/me creates the wallet; dev top-up is idempotent and admin-key guarded', async () => {
    const user = await createUser(t.app, 'Parent');
    const me = await request(t.app.getHttpServer())
      .get('/wallet/me')
      .set(user.auth)
      .expect(200);
    expect(me.body.data).toMatchObject({
      balanceHalalas: 0,
      currency: 'SAR',
      frozen: false,
    });

    const key = '3f1c2b9e-8a4d-4c1e-9b2a-1d2e3f4a5b6c';
    await request(t.app.getHttpServer())
      .post('/dev/wallet/simulate/top-up')
      .set(user.auth)
      .set('Idempotency-Key', key)
      .send({ amountHalalas: 5000 })
      .expect(401);

    const first = await request(t.app.getHttpServer())
      .post('/dev/wallet/simulate/top-up')
      .set(user.auth)
      .set('x-admin-key', TEST_ADMIN_KEY)
      .set('Idempotency-Key', key)
      .send({ amountHalalas: 5000 })
      .expect(200);
    const second = await request(t.app.getHttpServer())
      .post('/dev/wallet/simulate/top-up')
      .set(user.auth)
      .set('x-admin-key', TEST_ADMIN_KEY)
      .set('Idempotency-Key', key)
      .send({ amountHalalas: 5000 })
      .expect(200);
    expect(second.body.data.entryId).toBe(first.body.data.entryId);
    expect(second.body.data.balanceHalalas).toBe(5000);

    const missingKey = await request(t.app.getHttpServer())
      .post('/dev/wallet/simulate/top-up')
      .set(user.auth)
      .set('x-admin-key', TEST_ADMIN_KEY)
      .send({ amountHalalas: 5000 })
      .expect(400);
    expect(missingKey.body.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});
