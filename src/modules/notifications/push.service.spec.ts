import * as admin from 'firebase-admin';
import { PushService, stringifyData } from './push.service';
import type { DeviceTokensRepository } from './device-tokens.repository';

jest.mock('firebase-admin', () => {
  const send = jest.fn().mockResolvedValue('id');
  return { apps: [{}], messaging: () => ({ send }), __send: send };
});

describe('PushService.sendToUser (026, contracts/push-notifications.md)', () => {
  const send = (admin as unknown as { __send: jest.Mock }).__send;
  const repo = {
    getTokens: jest.fn().mockResolvedValue([
      { token: 'android-1', platform: 'fcm', locale: 'en' },
      { token: 'iphone-1', platform: 'apns', locale: 'ar' },
      { token: 'watch-1', platform: 'apns-watch', locale: 'ar' },
    ]),
  } as unknown as DeviceTokensRepository;
  const service = new PushService(repo);

  beforeEach(() => send.mockClear());

  it('renders per token locale, sends string-only data and the FCM shape; skips watch tokens', async () => {
    await service.sendToUser(
      'u1',
      {
        type: 'allowance.requestCreated',
        data: { childId: 'c1', rev: 45, requestId: undefined },
        render: (l) => ({ title: l, body: `body-${l}` }),
        apnsCategory: 'ALLOWANCE_REQUEST',
        threadId: 'allowance:c1',
      },
      { audience: 'phone' },
    );
    expect(send).toHaveBeenCalledTimes(2);
    const [android, iphone] = send.mock.calls.map((c) => c[0]);
    expect(android).toMatchObject({
      token: 'android-1',
      notification: { title: 'en', body: 'body-en' },
      data: { type: 'allowance.requestCreated', childId: 'c1', rev: '45' },
      android: {
        notification: { channelId: 'allowance', tag: 'allowance:c1' },
      },
    });
    expect(android.data).not.toHaveProperty('requestId');
    expect(iphone).toMatchObject({
      token: 'iphone-1',
      notification: { title: 'ar' },
      apns: {
        payload: {
          aps: {
            category: 'ALLOWANCE_REQUEST',
            'thread-id': 'allowance:c1',
            sound: 'default',
          },
        },
      },
    });
  });

  it('audience watch sends no visible notifications', async () => {
    await service.sendToUser(
      'u1',
      { type: 't', render: () => ({ title: 'a', body: 'b' }) },
      { audience: 'watch' },
    );
    expect(send).not.toHaveBeenCalled();
  });

  describe('watch background pushes (026, R9)', () => {
    const watchTokens = [
      { token: 'iphone-1', platform: 'apns', locale: 'ar' },
      { token: 'watch-1', platform: 'apns-watch', locale: 'ar' },
    ];
    const makeService = () => {
      const apns = { sendBackground: jest.fn().mockResolvedValue('sent') };
      const tokenRepo = {
        getTokens: jest.fn().mockResolvedValue(watchTokens),
      } as unknown as DeviceTokensRepository;
      return { service: new PushService(tokenRepo, apns as never), apns };
    };

    it('sendWatchRefresh sends the background payload to apns-watch tokens only', async () => {
      const { service, apns } = makeService();
      await service.sendWatchRefresh('c1', 45, { now: 1_000_000 });
      expect(apns.sendBackground).toHaveBeenCalledTimes(1);
      expect(apns.sendBackground).toHaveBeenCalledWith('watch-1', {
        aps: { 'content-available': 1 },
        type: 'allowance.changed',
        childId: 'c1',
        rev: '45',
      });
    });

    it('debounces to one push per child per 2 s window', async () => {
      const { service, apns } = makeService();
      await service.sendWatchRefresh('c1', 1, { now: 1_000_000 });
      await service.sendWatchRefresh('c1', 2, { now: 1_000_000 + 1999 });
      expect(apns.sendBackground).toHaveBeenCalledTimes(1);
      await service.sendWatchRefresh('c1', 3, { now: 1_000_000 + 2000 });
      expect(apns.sendBackground).toHaveBeenCalledTimes(2);
      await service.sendWatchRefresh('c2', 1, { now: 1_000_000 + 2001 });
      expect(apns.sendBackground).toHaveBeenCalledTimes(3);
    });

    it('force bypasses the debounce (the final push on unlink)', async () => {
      const { service, apns } = makeService();
      await service.sendWatchRefresh('c1', 1, { now: 1_000_000 });
      await service.sendWatchRefresh('c1', 2, { now: 1_000_100, force: true });
      expect(apns.sendBackground).toHaveBeenCalledTimes(2);
    });

    it('sendToUser never sends a visible alert to the watch; audience all adds the background refresh', async () => {
      const { service, apns } = makeService();
      send.mockClear();
      await service.sendToUser(
        'u',
        {
          type: 't',
          data: { childId: 'c1' },
          render: () => ({ title: 'a', body: 'b' }),
        },
        { audience: 'all' },
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].token).toBe('iphone-1');
      expect(apns.sendBackground).toHaveBeenCalledTimes(1);
      await service.sendToUser(
        'u',
        { type: 't', render: () => ({ title: 'a', body: 'b' }) },
        { audience: 'phone' },
      );
      expect(apns.sendBackground).toHaveBeenCalledTimes(1);
    });
  });

  it('stringifyData drops null/undefined and stringifies values', () => {
    expect(stringifyData('x', { a: 1, b: null, c: true })).toEqual({
      type: 'x',
      a: '1',
      c: 'true',
    });
  });
});
