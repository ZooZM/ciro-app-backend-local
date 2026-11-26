import { Types } from 'mongoose';
import { FamilyService } from './family.service';
import { ALLOWANCE_DEFAULTS } from '../family-core/family-core.constants';

describe('FamilyService (026, US1)', () => {
  const parentId = new Types.ObjectId().toString();
  const childId = new Types.ObjectId().toString();
  const session = { id: 'session' };

  let linkCodes: Record<string, jest.Mock>;
  let access: Record<string, jest.Mock>;
  let links: Record<string, jest.Mock>;
  let settings: Record<string, jest.Mock>;
  let cards: Record<string, jest.Mock>;
  let wallet: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let summaries: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;
  let cardsRepo: Record<string, jest.Mock>;
  let requestsRepo: Record<string, jest.Mock>;
  let auth: Record<string, jest.Mock>;
  let push: Record<string, jest.Mock>;
  let service: FamilyService;

  const code = async (p: Promise<unknown>) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { getResponse?: () => { error?: string } } | null;
    return e?.getResponse?.().error;
  };

  beforeEach(() => {
    linkCodes = {
      create: jest.fn().mockResolvedValue({
        code: 'abc',
        data: { expiresAt: '2026-11-18T10:10:00.000Z' },
      }),
      get: jest.fn().mockResolvedValue({
        parentUserId: parentId,
        state: 'issued',
        expiresAt: 'x',
      }),
      claim: jest.fn().mockResolvedValue({ expiresAt: 'x' }),
      getCurrentForParent: jest.fn().mockResolvedValue({
        code: 'abc',
        data: {
          parentUserId: parentId,
          state: 'claimed',
          childUserId: childId,
          claimedAt: '2026-11-18T10:00:00.000Z',
        },
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteCurrentForParent: jest.fn(),
    };
    access = {
      getRole: jest.fn().mockResolvedValue('none'),
      countActiveChildren: jest.fn().mockResolvedValue(0),
    };
    links = {
      findActiveByChild: jest.fn().mockResolvedValue(null),
      findActiveByParent: jest.fn().mockResolvedValue([]),
      insert: jest.fn((d: Record<string, unknown>) =>
        Promise.resolve({ _id: new Types.ObjectId(), ...d }),
      ),
    };
    settings = { insert: jest.fn().mockResolvedValue({}) };
    cards = {
      issueCardForLink: jest
        .fn()
        .mockResolvedValue({ cardRef: 'stub_1', last4: '4242' }),
      insertCard: jest.fn().mockResolvedValue({}),
    };
    const accountId = new Types.ObjectId();
    const walletId = new Types.ObjectId();
    wallet = {
      runInTransaction: jest.fn((fn: (s: unknown) => unknown) => fn(session)),
      createChildAccount: jest.fn().mockResolvedValue({ _id: accountId }),
      getOrCreateUserWallet: jest.fn().mockResolvedValue({ _id: walletId }),
      setFrozen: jest.fn().mockResolvedValue(undefined),
    };
    users = {
      findById: jest.fn((id: string) =>
        Promise.resolve({
          _id: id,
          name: id === parentId ? 'Mama' : 'Sara',
          phoneNumber: '+9665',
          avatarUrl: '',
        }),
      ),
    };
    summaries = { toChildListItem: jest.fn().mockResolvedValue({ childId }) };
    events = {
      linkClaimed: jest.fn(),
      summaryChanged: jest.fn().mockResolvedValue(undefined),
      unlinked: jest.fn(),
      requestResolved: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined),
    };
    cardsRepo = {
      findByLinkId: jest.fn().mockResolvedValue(null),
      setStatus: jest.fn().mockResolvedValue({}),
    };
    requestsRepo = {
      findPendingByLink: jest.fn().mockResolvedValue(null),
      transition: jest.fn(),
    };
    auth = { revokeDeviceSession: jest.fn().mockResolvedValue(undefined) };
    push = { sendWatchRefresh: jest.fn().mockResolvedValue(undefined) };
    service = new FamilyService(
      linkCodes as never,
      access as never,
      links as never,
      settings as never,
      cards as never,
      wallet as never,
      users as never,
      summaries as never,
      events as never,
      cardsRepo as never,
      requestsRepo as never,
      auth as never,
      push as never,
    );
  });

  describe('refusals (each has its own code)', () => {
    it('CANNOT_LINK_SELF', async () => {
      expect(await code(service.preview(parentId, 'abc'))).toBe(
        'CANNOT_LINK_SELF',
      );
      expect(await code(service.claim(parentId, 'abc'))).toBe(
        'CANNOT_LINK_SELF',
      );
    });

    it('CHILD_ALREADY_LINKED', async () => {
      links.findActiveByChild.mockResolvedValue({ _id: 'l' });
      expect(await code(service.preview(childId, 'abc'))).toBe(
        'CHILD_ALREADY_LINKED',
      );
    });

    it('ACCOUNT_IS_PARENT', async () => {
      access.countActiveChildren.mockResolvedValue(2);
      expect(await code(service.claim(childId, 'abc'))).toBe(
        'ACCOUNT_IS_PARENT',
      );
      expect(linkCodes.claim).not.toHaveBeenCalled();
    });

    it('ACCOUNT_IS_CHILD when a linked child makes a code', async () => {
      access.getRole.mockResolvedValue('child');
      expect(await code(service.createLinkCode(childId))).toBe(
        'ACCOUNT_IS_CHILD',
      );
    });

    it('MAX_CHILDREN_REACHED at 10', async () => {
      access.countActiveChildren.mockResolvedValue(10);
      expect(await code(service.createLinkCode(parentId))).toBe(
        'MAX_CHILDREN_REACHED',
      );
    });

    it('LINK_CODE_ALREADY_USED when the code is already claimed', async () => {
      linkCodes.get.mockResolvedValue({
        parentUserId: parentId,
        state: 'claimed',
      });
      expect(await code(service.preview(childId, 'abc'))).toBe(
        'LINK_CODE_ALREADY_USED',
      );
    });

    it('LINK_CODE_INVALID_OR_EXPIRED for an unknown code', async () => {
      linkCodes.get.mockResolvedValue(null);
      expect(await code(service.preview(childId, 'nope'))).toBe(
        'LINK_CODE_INVALID_OR_EXPIRED',
      );
    });

    it('LINK_CODE_NOT_CLAIMED when the parent confirms before a claim', async () => {
      linkCodes.getCurrentForParent.mockResolvedValue({
        code: 'abc',
        data: { parentUserId: parentId, state: 'issued' },
      });
      expect(await code(service.confirm(parentId))).toBe(
        'LINK_CODE_NOT_CLAIMED',
      );
      expect(wallet.runInTransaction).not.toHaveBeenCalled();
    });

    it('re-checks the role rules inside the confirm transaction', async () => {
      access.countActiveChildren.mockImplementation((id: string) =>
        Promise.resolve(id === parentId ? 10 : 0),
      );
      expect(await code(service.confirm(parentId))).toBe(
        'MAX_CHILDREN_REACHED',
      );
      links.findActiveByChild.mockResolvedValue({ _id: 'other' });
      expect(await code(service.confirm(parentId))).toBe(
        'CHILD_ALREADY_LINKED',
      );
    });
  });

  it('preview has no side effects and shows the parent', async () => {
    const result = await service.preview(childId, 'abc');
    expect(result.parent.name).toBe('Mama');
    expect(linkCodes.claim).not.toHaveBeenCalled();
    expect(events.linkClaimed).not.toHaveBeenCalled();
  });

  it('claim tells the parent’s screen with the child’s name and phone', async () => {
    await service.claim(childId, 'abc');
    expect(linkCodes.claim).toHaveBeenCalledWith('abc', childId);
    expect(events.linkClaimed).toHaveBeenCalledWith(
      parentId,
      { id: childId, name: 'Sara', phoneNumber: '+9665' },
      'x',
    );
  });

  describe('confirm', () => {
    it('creates link, child account, default settings and card in ONE transaction', async () => {
      await service.confirm(parentId);
      expect(wallet.runInTransaction).toHaveBeenCalledTimes(1);
      expect(links.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          rev: 1,
          childConfirmedAt: new Date('2026-11-18T10:00:00.000Z'),
        }),
        session,
      );
      const inserted = links.insert.mock.calls[0][0] as {
        parentConfirmedAt: Date;
      };
      expect(inserted.parentConfirmedAt).toBeInstanceOf(Date);
      expect(wallet.createChildAccount).toHaveBeenCalledWith(childId, session);
      expect(settings.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ...ALLOWANCE_DEFAULTS,
          payoutsActiveFromMonth: null,
        }),
        session,
      );
      expect(cards.insertCard).toHaveBeenCalledWith(
        expect.anything(),
        { cardRef: 'stub_1', last4: '4242' },
        session,
      );
    });

    it('calls the issuer before the transaction, never inside it', async () => {
      const order: string[] = [];
      cards.issueCardForLink.mockImplementation(() => {
        order.push('issue');
        return Promise.resolve({ cardRef: 'c', last4: '1111' });
      });
      wallet.runInTransaction.mockImplementation(
        (fn: (s: unknown) => unknown) => {
          order.push('txn');
          return fn(session);
        },
      );
      await service.confirm(parentId);
      expect(order).toEqual(['issue', 'txn']);
    });

    it('freezes the child’s own user wallet (FR-008)', async () => {
      await service.confirm(parentId);
      expect(wallet.getOrCreateUserWallet).toHaveBeenCalledWith(
        childId,
        session,
      );
      expect(wallet.setFrozen).toHaveBeenCalledWith(
        expect.any(Types.ObjectId),
        true,
        session,
      );
    });

    it('deletes the code after commit and tells the child', async () => {
      await service.confirm(parentId);
      expect(linkCodes.delete).toHaveBeenCalledWith('abc', parentId);
      expect(events.summaryChanged).toHaveBeenCalledWith(
        childId,
        'linked',
        undefined,
        expect.anything(),
      );
      const txnOrder = wallet.runInTransaction.mock.invocationCallOrder[0];
      expect(linkCodes.delete.mock.invocationCallOrder[0]).toBeGreaterThan(
        txnOrder,
      );
      expect(events.summaryChanged.mock.invocationCallOrder[0]).toBeGreaterThan(
        txnOrder,
      );
    });

    it('maps a duplicate-key race on the active link index to CHILD_ALREADY_LINKED', async () => {
      wallet.runInTransaction.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 11000 }),
      );
      expect(await code(service.confirm(parentId))).toBe(
        'CHILD_ALREADY_LINKED',
      );
      expect(linkCodes.delete).not.toHaveBeenCalled();
    });
  });

  describe('unlink (US8, FR-006)', () => {
    const linkId = new Types.ObjectId();
    const childAccount = new Types.ObjectId();
    const parentWallet = new Types.ObjectId();
    const ownWallet = new Types.ObjectId();
    const cardId = new Types.ObjectId();
    const link = {
      _id: linkId,
      parentUserId: new Types.ObjectId(parentId),
      childUserId: new Types.ObjectId(childId),
      childAccountId: childAccount,
      rev: 5,
      status: 'active',
    };
    let balance: number;

    beforeEach(() => {
      balance = 4550;
      access.assertParentOf = jest.fn().mockResolvedValue(link);
      links.markUnlinked = jest
        .fn()
        .mockResolvedValue({ ...link, status: 'unlinked', rev: 6 });
      wallet.getBalance = jest.fn(() => Promise.resolve(balance));
      wallet.transfer = jest.fn().mockResolvedValue({
        entry: { _id: new Types.ObjectId() },
        replayed: false,
      });
      wallet.getOrCreateUserWallet = jest
        .fn()
        .mockResolvedValue({ _id: parentWallet });
      wallet.findUserWallet = jest.fn().mockResolvedValue({ _id: ownWallet });
      cardsRepo.findByLinkId.mockResolvedValue({
        _id: cardId,
        status: 'active',
      });
      cards.enqueueSync = jest.fn().mockResolvedValue(undefined);
    });

    it('returns a 45.50 balance to the parent as one unlink_return entry', async () => {
      const res = await service.unlink(parentId, childId);
      expect(res).toEqual({ returnedHalalas: 4550, currency: 'SAR' });
      expect(wallet.transfer).toHaveBeenCalledTimes(1);
      expect(wallet.transfer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unlink_return',
          fromAccountId: childAccount,
          toAccountId: parentWallet,
          amountHalalas: 4550,
          idempotencyKey: `unlink:${linkId.toString()}`,
        }),
        session,
      );
      expect(wallet.runInTransaction).toHaveBeenCalledTimes(1);
    });

    it('a zero balance posts no entry', async () => {
      balance = 0;
      expect(await service.unlink(parentId, childId)).toEqual({
        returnedHalalas: 0,
        currency: 'SAR',
      });
      expect(wallet.transfer).not.toHaveBeenCalled();
    });

    it('marks the link unlinked (reason parent), deactivates the card and unfreezes the child’s own wallet in the same transaction', async () => {
      await service.unlink(parentId, childId);
      expect(links.markUnlinked).toHaveBeenCalledWith(
        linkId,
        'parent',
        session,
      );
      expect(cardsRepo.setStatus).toHaveBeenCalledWith(
        cardId,
        ['active', 'paused'],
        'inactive',
        link.parentUserId,
        session,
      );
      expect(wallet.setFrozen).toHaveBeenCalledWith(ownWallet, false, session);
    });

    it('cancels a pending request and tells both sides after commit', async () => {
      const pending = { _id: new Types.ObjectId() };
      const cancelled = { _id: pending._id, status: 'cancelled' };
      requestsRepo.findPendingByLink.mockResolvedValue(pending);
      requestsRepo.transition.mockResolvedValue(cancelled);
      await service.unlink(parentId, childId);
      expect(requestsRepo.transition).toHaveBeenCalledWith(
        pending._id,
        expect.objectContaining({ status: 'cancelled' }),
        session,
      );
      expect(events.requestResolved).toHaveBeenCalledWith(cancelled, 6);
    });

    it('after commit: terminate job, unlinked event to child and former parent, and a push to the child', async () => {
      await service.unlink(parentId, childId);
      const txn = wallet.runInTransaction.mock.invocationCallOrder[0];
      expect(cards.enqueueSync).toHaveBeenCalledWith(cardId, 'terminate');
      expect(events.unlinked).toHaveBeenCalledWith(childId, parentId, 6);
      expect(events.notify).toHaveBeenCalledWith(
        childId,
        'allowance.unlinked',
        { childId },
        { childId },
      );
      expect(events.unlinked.mock.invocationCallOrder[0]).toBeGreaterThan(txn);
    });

    it('the watch hears about the unlink first; only then is its session revoked and its push tokens deleted', async () => {
      await service.unlink(parentId, childId);
      expect(push.sendWatchRefresh).toHaveBeenCalledWith(childId, 6, {
        force: true,
      });
      expect(auth.revokeDeviceSession).toHaveBeenCalledWith(
        childId,
        'unlinked',
      );
      expect(push.sendWatchRefresh.mock.invocationCallOrder[0]).toBeLessThan(
        auth.revokeDeviceSession.mock.invocationCallOrder[0],
      );
    });

    it('a stranger cannot unlink (404 from the ownership check) and nothing runs', async () => {
      access.assertParentOf.mockRejectedValue(new Error('CHILD_NOT_FOUND'));
      await expect(service.unlink(parentId, childId)).rejects.toThrow(
        'CHILD_NOT_FOUND',
      );
      expect(wallet.runInTransaction).not.toHaveBeenCalled();
    });

    it('losing a race with another unlink aborts without moving money twice', async () => {
      links.markUnlinked.mockResolvedValue(null);
      expect(await code(service.unlink(parentId, childId))).toBe(
        'CHILD_NOT_FOUND',
      );
      expect(wallet.transfer).not.toHaveBeenCalled();
      expect(auth.revokeDeviceSession).not.toHaveBeenCalled();
    });

    describe('handleAccountDeletion (research F10)', () => {
      it('a child is unlinked with reason child_account_deleted and gets no “turned off by your parent” push', async () => {
        links.findActiveByChild.mockResolvedValue(link);
        expect(await service.handleAccountDeletion(childId)).toEqual({
          unlinked: true,
        });
        expect(links.markUnlinked).toHaveBeenCalledWith(
          linkId,
          'child_account_deleted',
          session,
        );
        expect(events.notify).not.toHaveBeenCalled();
        expect(auth.revokeDeviceSession).toHaveBeenCalledWith(
          childId,
          'unlinked',
        );
      });

      it('a parent with active children is refused: they must unlink first', async () => {
        links.findActiveByChild.mockResolvedValue(null);
        access.countActiveChildren.mockResolvedValue(2);
        expect(await code(service.handleAccountDeletion(parentId))).toBe(
          'ACCOUNT_IS_PARENT',
        );
        expect(links.markUnlinked).not.toHaveBeenCalled();
      });

      it('a user with no family is a no-op', async () => {
        links.findActiveByChild.mockResolvedValue(null);
        access.countActiveChildren.mockResolvedValue(0);
        expect(await service.handleAccountDeletion(parentId)).toEqual({
          unlinked: false,
        });
      });
    });
  });

  describe('getMe', () => {
    it('none', async () => {
      expect(await service.getMe(parentId)).toEqual({
        role: 'none',
        parent: null,
        children: [],
      });
    });

    it('child sees the parent', async () => {
      links.findActiveByChild.mockResolvedValue({
        parentUserId: new Types.ObjectId(parentId),
      });
      const me = await service.getMe(childId);
      expect(me).toMatchObject({
        role: 'child',
        parent: { id: parentId, name: 'Mama' },
        children: [],
      });
    });

    it('parent sees ChildListItems', async () => {
      links.findActiveByParent.mockResolvedValue([
        { _id: 'l1' },
        { _id: 'l2' },
      ]);
      const me = await service.getMe(parentId);
      expect(me.role).toBe('parent');
      expect(me.children).toHaveLength(2);
    });
  });
});
