import { Types } from 'mongoose';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService (026, FR-022, R15)', () => {
  const a = new Types.ObjectId();
  const b = new Types.ObjectId();
  let accountsData: { _id: Types.ObjectId; balanceHalalas: number }[];
  let derived: Map<string, number>[];
  let derivedCalls: (Types.ObjectId[] | undefined)[];
  let alert: jest.Mock;
  let created: Record<string, unknown>[];
  let service: ReconciliationService;

  beforeEach(() => {
    accountsData = [
      { _id: a, balanceHalalas: 100 },
      { _id: b, balanceHalalas: 50 },
    ];
    derived = [
      new Map([
        [a.toString(), 100],
        [b.toString(), 50],
      ]),
    ];
    derivedCalls = [];
    alert = jest.fn().mockResolvedValue(undefined);
    created = [];
    let call = 0;
    service = new ReconciliationService(
      {
        allCursor: () =>
          // eslint-disable-next-line @typescript-eslint/require-await
          (async function* () {
            for (const x of accountsData) yield x;
          })(),
        findByIds: (ids: Types.ObjectId[]) =>
          Promise.resolve(
            accountsData
              .filter((x) => ids.some((i) => i.equals(x._id)))
              .map((x) => ({ toObject: () => x })),
          ),
      } as never,
      {
        derivedBalances: jest.fn((ids?: Types.ObjectId[]) => {
          derivedCalls.push(ids);
          return Promise.resolve(derived[Math.min(call++, derived.length - 1)]);
        }),
      } as never,
      { alert } as never,
      {
        create: jest.fn((d: Record<string, unknown>) => {
          created.push(d);
          return Promise.resolve({ _id: new Types.ObjectId(), ...d });
        }),
      } as never,
    );
    service.recheckDelayMs = 0;
  });

  it('a clean run reports ok and raises no alert', async () => {
    const report = await service.run();
    expect(report.status).toBe('ok');
    expect(created[0]).toMatchObject({
      accountsChecked: 2,
      mismatches: [],
      status: 'ok',
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it('a confirmed mismatch raises exactly one LEDGER_MISMATCH alert and is written to the report', async () => {
    derived = [
      new Map([
        [a.toString(), 90],
        [b.toString(), 50],
      ]),
    ];
    const report = await service.run();
    expect(report.status).toBe('mismatch');
    expect(created[0].mismatches).toEqual([
      { accountId: a, cachedHalalas: 100, derivedHalalas: 90 },
    ]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'LEDGER_MISMATCH',
      expect.any(String),
      expect.objectContaining({ mismatches: 1 }),
    );
  });

  it('a difference that disappears on the re-check (an in-flight transfer) raises nothing', async () => {
    derived = [
      new Map([
        [a.toString(), 90],
        [b.toString(), 50],
      ]),
      new Map([[a.toString(), 100]]),
    ];
    const report = await service.run();
    expect(report.status).toBe('ok');
    expect(alert).not.toHaveBeenCalled();
    // The second pass only looked at the suspect account.
    expect(derivedCalls[1]).toEqual([a]);
  });

  it('an account with no entries must have a zero cached balance', async () => {
    accountsData = [{ _id: a, balanceHalalas: 5 }];
    derived = [new Map()];
    expect((await service.run()).status).toBe('mismatch');
  });

  it('runs registered checks into the same report and keeps counter rewrites', async () => {
    const rewrite = {
      childUserId: 'c1',
      riyadhDate: '2026-11-18',
      from: 2000,
      to: 500,
    };
    service.registerCheck('spend-counters', () =>
      Promise.resolve({
        ok: true,
        details: { rewritten: 1 },
        counterRewrites: [rewrite],
      }),
    );
    const report = await service.run();
    expect(report.status).toBe('ok');
    expect(created[0]).toMatchObject({
      counterRewrites: [rewrite],
      checks: [{ name: 'spend-counters', ok: true, details: { rewritten: 1 } }],
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it('a failing or throwing check makes the report a mismatch and alerts once', async () => {
    service.registerCheck('boom', () =>
      Promise.reject(new Error('redis down')),
    );
    const report = await service.run();
    expect(report.status).toBe('mismatch');
    expect(created[0].checks).toEqual([
      { name: 'boom', ok: false, details: { error: 'redis down' } },
    ]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][2]).toMatchObject({ failedChecks: ['boom'] });
  });
});
