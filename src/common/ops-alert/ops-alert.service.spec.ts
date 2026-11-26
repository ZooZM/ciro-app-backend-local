import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { OpsAlertService } from './ops-alert.service';

function serviceWith(url: string | undefined): OpsAlertService {
  const config = { get: jest.fn(() => url) } as unknown as ConfigService;
  return new OpsAlertService(config);
}

describe('OpsAlertService (026, FR-022, SC-006)', () => {
  let fetchSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('only logs when no webhook URL is set', async () => {
    await serviceWith(undefined).alert('LEDGER_MISMATCH', 'drift', { a: 1 });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OPS ALERT] LEDGER_MISMATCH drift'),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs exactly once when a webhook URL is set', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    await serviceWith('https://ops.example.test/hook').alert(
      'PAYOUT_SYSTEM_FAILURE',
      'payout failed',
      { childUserId: 'c1' },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ops.example.test/hook');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      code: 'PAYOUT_SYSTEM_FAILURE',
      message: 'payout failed',
      details: { childUserId: 'c1' },
    });
    expect(typeof body.at).toBe('string');
  });

  it('never throws when the webhook fails', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(
      serviceWith('https://ops.example.test/hook').alert('X', 'y'),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('never throws when the webhook answers an error status', async () => {
    fetchSpy.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(
      serviceWith('https://ops.example.test/hook').alert('X', 'y'),
    ).resolves.toBeUndefined();
  });
});
