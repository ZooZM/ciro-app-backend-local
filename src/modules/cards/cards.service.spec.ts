import { Types } from 'mongoose';
import { CardsService } from './cards.service';

describe('CardsService pause/resume (026, US6, FR-059)', () => {
  const parentId = new Types.ObjectId().toString();
  const childId = new Types.ObjectId().toString();
  const linkId = new Types.ObjectId();
  const cardId = new Types.ObjectId();
  const session = { id: 's' };
  const link = { _id: linkId };

  let cards: Record<string, jest.Mock>;
  let links: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let queue: { add: jest.Mock };
  let service: CardsService;
  let status: string;

  const code = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { getResponse?: () => { error?: string } } | null;
    return e?.getResponse?.().error;
  };

  beforeEach(() => {
    status = 'active';
    cards = {
      findByLinkId: jest.fn(() => Promise.resolve({ _id: cardId, status })),
      findById: jest.fn(() => Promise.resolve({ _id: cardId, status })),
      setStatus: jest.fn((_id: unknown, from: string[], to: string) => {
        if (!from.includes(status)) return Promise.resolve(null);
        status = to;
        return Promise.resolve({ _id: cardId, status });
      }),
    };
    links = { bumpRev: jest.fn().mockResolvedValue(2) };
    wallet = {
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
    };
    events = {
      summaryChanged: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new CardsService(
      cards as never,
      links as never,
      { assertParentOf: jest.fn().mockResolvedValue(link) } as never,
      wallet as never,
      events as never,
      queue as never,
      { name: 'stub' } as never,
    );
  });

  it('pause flips active → paused, bumps rev in the same transaction and notifies after commit', async () => {
    expect(await service.pause(parentId, childId)).toEqual({
      status: 'paused',
    });
    expect(cards.setStatus).toHaveBeenCalledWith(
      cardId,
      ['active'],
      'paused',
      expect.any(Types.ObjectId),
      session,
    );
    expect(links.bumpRev).toHaveBeenCalledWith(linkId, session);
    expect(events.summaryChanged).toHaveBeenCalledWith(
      childId,
      'card_paused',
      undefined,
      link,
    );
    expect(events.notify).toHaveBeenCalledWith(
      childId,
      'allowance.cardPaused',
      { childId },
      { childId },
    );
    expect(events.summaryChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
      wallet.runInTransaction.mock.invocationCallOrder[0],
    );
  });

  it('resume flips paused → active', async () => {
    status = 'paused';
    expect(await service.resume(parentId, childId)).toEqual({
      status: 'active',
    });
    expect(events.summaryChanged).toHaveBeenCalledWith(
      childId,
      'card_resumed',
      undefined,
      link,
    );
    expect(events.notify).toHaveBeenCalledWith(
      childId,
      'allowance.cardResumed',
      { childId },
      { childId },
    );
  });

  it('the issuer freeze or unfreeze job is enqueued after commit, with retries', async () => {
    await service.pause(parentId, childId);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe(`card-sync:${cardId.toString()}:freeze`);
    expect(data).toEqual({ cardId: cardId.toString(), op: 'freeze' });
    expect(opts.attempts).toBeGreaterThan(1);
    expect(opts.jobId).not.toContain(':');
    expect(queue.add.mock.invocationCallOrder[0]).toBeGreaterThan(
      wallet.runInTransaction.mock.invocationCallOrder[0],
    );

    status = 'paused';
    await service.resume(parentId, childId);
    expect(queue.add.mock.calls[1][1]).toEqual({
      cardId: cardId.toString(),
      op: 'unfreeze',
    });
  });

  it('is idempotent: pausing a paused card changes nothing', async () => {
    status = 'paused';
    expect(await service.pause(parentId, childId)).toEqual({
      status: 'paused',
    });
    expect(wallet.runInTransaction).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(events.notify).not.toHaveBeenCalled();
  });

  it('an inactive card → 409 CARD_INACTIVE for both pause and resume', async () => {
    status = 'inactive';
    expect(await code(service.pause(parentId, childId))).toBe('CARD_INACTIVE');
    expect(await code(service.resume(parentId, childId))).toBe('CARD_INACTIVE');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('a queue failure never fails the request', async () => {
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.pause(parentId, childId)).resolves.toEqual({
      status: 'paused',
    });
  });
});
