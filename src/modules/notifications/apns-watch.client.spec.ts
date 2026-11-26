import { generateKeyPairSync, verify } from 'crypto';
import { EventEmitter } from 'events';
import * as http2 from 'http2';
import { ApnsWatchClient, APNS_JWT_MAX_AGE_MS } from './apns-watch.client';
import { Logger } from '@nestjs/common';

jest.mock('http2', () => {
  const actual = jest.requireActual('http2');
  return { ...actual, connect: jest.fn() };
});

/** 026 (T163, research R9, contracts/push-notifications.md "Watch background push"). */
describe('ApnsWatchClient (026)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const env: Record<string, string | undefined> = {
    APNS_KEY_ID: 'KEY123',
    APNS_TEAM_ID: 'TEAM1',
    // As stored in an env var: newlines escaped.
    APNS_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
    APNS_WATCH_TOPIC: 'com.cirochat.zooz.chinaparts.watchkitapp',
    APNS_ENV: 'sandbox',
  };
  let tokens: { deleteToken: jest.Mock };
  let requests: { headers: Record<string, string>; body: string }[];
  let respond: { status: number; body: string };
  const connect = http2.connect as unknown as jest.Mock;

  const build = (overrides: Record<string, string | undefined> = {}) =>
    new ApnsWatchClient(
      { get: (k: string) => ({ ...env, ...overrides })[k] } as never,
      tokens as never,
    );

  beforeEach(() => {
    tokens = { deleteToken: jest.fn().mockResolvedValue(undefined) };
    requests = [];
    respond = { status: 200, body: '' };
    connect.mockReset();
    connect.mockImplementation(() => {
      const session = new EventEmitter() as EventEmitter &
        Record<string, unknown>;
      session.closed = false;
      session.destroyed = false;
      session.close = jest.fn();
      session.destroy = jest.fn();
      session.request = (headers: Record<string, string>) => {
        const req = new EventEmitter() as EventEmitter &
          Record<string, unknown>;
        req.setEncoding = jest.fn();
        req.setTimeout = jest.fn();
        req.close = jest.fn();
        req.end = (body: string) => {
          requests.push({ headers, body });
          setImmediate(() => {
            req.emit('response', { ':status': respond.status });
            if (respond.body) req.emit('data', respond.body);
            req.emit('end');
          });
        };
        return req;
      };
      return session;
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('signs a real ES256 provider token (header kid, iss/iat payload, raw r||s signature)', () => {
    const token = build().providerToken(1_700_000_000_000);
    const [h, p, sig] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY123',
    });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: 'TEAM1',
      iat: 1_700_000_000,
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig, 'base64url'),
    );
    expect(ok).toBe(true);
    expect(Buffer.from(sig, 'base64url')).toHaveLength(64);
  });

  it('caches the provider token for at most 50 minutes', () => {
    const client = build();
    const t0 = 1_000_000;
    const first = client.providerToken(t0);
    expect(client.providerToken(t0 + APNS_JWT_MAX_AGE_MS - 1)).toBe(first);
    expect(client.providerToken(t0 + APNS_JWT_MAX_AGE_MS)).not.toBe(first);
  });

  it('sends background pushes with the right headers, topic and path', async () => {
    const client = build();
    expect(
      await client.sendBackground('abcd', {
        aps: { 'content-available': 1 },
        type: 'allowance.changed',
        childId: 'c1',
        rev: '45',
      }),
    ).toBe('sent');
    expect(connect).toHaveBeenCalledWith('https://api.sandbox.push.apple.com');
    const { headers, body } = requests[0];
    expect(headers).toMatchObject({
      ':method': 'POST',
      ':path': '/3/device/abcd',
      'apns-push-type': 'background',
      'apns-priority': '5',
      'apns-topic': env.APNS_WATCH_TOPIC,
      authorization: expect.stringMatching(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/),
    });
    expect(JSON.parse(body)).toEqual({
      aps: { 'content-available': 1 },
      type: 'allowance.changed',
      childId: 'c1',
      rev: '45',
    });
  });

  it('uses the production host when APNS_ENV=production, and reuses one connection', async () => {
    const client = build({ APNS_ENV: 'production' });
    await client.sendBackground('a', {});
    await client.sendBackground('b', {});
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith('https://api.push.apple.com');
  });

  it('410 Unregistered deletes the token row', async () => {
    respond = { status: 410, body: JSON.stringify({ reason: 'Unregistered' }) };
    expect(await build().sendBackground('dead', {})).toBe('unregistered');
    expect(tokens.deleteToken).toHaveBeenCalledWith('dead');
  });

  it('400 BadDeviceToken deletes the token row; other 400s do not', async () => {
    respond = {
      status: 400,
      body: JSON.stringify({ reason: 'BadDeviceToken' }),
    };
    expect(await build().sendBackground('bad', {})).toBe('unregistered');
    expect(tokens.deleteToken).toHaveBeenCalledWith('bad');
    tokens.deleteToken.mockClear();
    respond = { status: 400, body: JSON.stringify({ reason: 'BadTopic' }) };
    expect(await build().sendBackground('keep', {})).toBe('failed');
    expect(tokens.deleteToken).not.toHaveBeenCalled();
  });

  it('a transport error never throws', async () => {
    connect.mockImplementation(() => {
      throw new Error('network down');
    });
    expect(await build().sendBackground('x', {})).toBe('failed');
  });

  it('with no env set it is disabled, logs one warning, and never connects', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const client = build({ APNS_KEY_ID: '', APNS_TEAM_ID: undefined });
    client.onModuleInit();
    expect(client.isEnabled()).toBe(false);
    expect(await client.sendBackground('x', {})).toBe('disabled');
    expect(await client.sendBackground('y', {})).toBe('disabled');
    expect(connect).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
