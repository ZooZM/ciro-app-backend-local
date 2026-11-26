import { Types } from 'mongoose';
import { PayoutsService } from './payouts.service';

describe('Payout reminders (026, FR-033)', () => {
  const asOf = new Date('2026-11-14T15:00:00Z'); // 18:00 Riyadh; tomorrow is the 15th
  let rows: {
    link: Record<string, unknown>;
    settings: Record<string, unknown>;
  }[];
  let paid: Record<string, unknown>[];
  let balances: Map<string, number>;
  let seen: Set<string>;
  let events: { notify: jest.Mock };
  let service: PayoutsService;

  const family = (
    parent: Types.ObjectId,
    payoutDay: number,
    amount: number,
  ) => {
    const linkId = new Types.ObjectId();
    const child = new Types.ObjectId();
    const link = { _id: linkId, parentUserId: parent, childUserId: child };
    const settings = {
      linkId,
      monthlyAmountHalalas: amount,
      payoutDay,
      payoutsActiveFromMonth: '2026-11',
    };
    rows.push({ link, settings });
    return child;
  };

  beforeEach(() => {
    rows = [];
    paid = [];
    balances = new Map();
    seen = new Set();
    events = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new PayoutsService(
      {} as never,
      {
        findAllActive: jest.fn((o: { parentIds?: Types.ObjectId[] }) =>
          Promise.resolve(
            rows
              .map((r) => r.link)
              .filter(
                (l) =>
                  !o.parentIds ||
                  o.parentIds.some((p) =>
                    p.equals(l.parentUserId as Types.ObjectId),
                  ),
              ),
          ),
        ),
      } as never,
      {
        findByLinkIds: jest.fn(() =>
          Promise.resolve(rows.map((r) => r.settings)),
        ),
      } as never,
      { findMonthsForChildren: jest.fn(() => Promise.resolve(paid)) } as never,
      {
        findUserWallet: jest.fn((id: string) =>
          Promise.resolve({ balanceHalalas: balances.get(String(id)) ?? 0 }),
        ),
      } as never,
      {} as never,
      events as never,
      {} as never,
      {
        set: jest.fn((key: string) => {
          if (seen.has(key)) return Promise.resolve(null);
          seen.add(key);
          return Promise.resolve('OK');
        }),
      } as never,
    );
  });

  it('only parents whose wallet is below the total due tomorrow get a reminder', async () => {
    const poor = new Types.ObjectId();
    const rich = new Types.ObjectId();
    family(poor, 15, 30000);
    family(rich, 15, 30000);
    balances.set(poor.toString(), 20000);
    balances.set(rich.toString(), 30000);
    expect(await service.runReminders(asOf)).toBe(1);
    expect(events.notify).toHaveBeenCalledTimes(1);
    expect(events.notify).toHaveBeenCalledWith(
      poor.toString(),
      'allowance.payoutReminder',
      expect.objectContaining({ neededHalalas: 30000, balanceHalalas: 20000 }),
      expect.anything(),
    );
  });

  it('sums every child due tomorrow for the same parent', async () => {
    const parent = new Types.ObjectId();
    family(parent, 15, 30000);
    family(parent, 15, 20000);
    balances.set(parent.toString(), 40000);
    await service.runReminders(asOf);
    expect(events.notify).toHaveBeenCalledWith(
      parent.toString(),
      'allowance.payoutReminder',
      expect.objectContaining({ neededHalalas: 50000 }),
      expect.anything(),
    );
  });

  it('at most once per parent per day (SET NX)', async () => {
    const parent = new Types.ObjectId();
    family(parent, 15, 30000);
    expect(await service.runReminders(asOf)).toBe(1);
    expect(await service.runReminders(asOf)).toBe(0);
    expect(events.notify).toHaveBeenCalledTimes(1);
    expect(await service.runReminders(new Date('2026-11-14T16:00:00Z'))).toBe(
      0,
    );
    expect([...seen]).toEqual([
      `allowance:reminder:${parent.toString()}:2026-11-14`,
    ]);
  });

  it('ignores children not due tomorrow, already paid this month, or without an allowance', async () => {
    const parent = new Types.ObjectId();
    family(parent, 20, 30000);
    const paidChild = family(parent, 15, 30000);
    family(parent, 15, 0);
    paid = [{ childUserId: paidChild }];
    expect(await service.runReminders(asOf)).toBe(0);
  });

  it('day 31 clamps: tomorrow is the 30th in April', async () => {
    const parent = new Types.ObjectId();
    const child = family(parent, 31, 30000);
    (
      rows[0].settings as { payoutsActiveFromMonth: string }
    ).payoutsActiveFromMonth = '2026-04';
    expect(child).toBeDefined();
    expect(await service.runReminders(new Date('2026-04-29T15:00:00Z'))).toBe(
      1,
    );
  });
});
