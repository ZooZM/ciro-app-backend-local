import { NotImplementedException } from '@nestjs/common';
import { StubIssuerProvider } from './stub-issuer.provider';
import type { IssuerProvider } from './issuer-provider';

describe('StubIssuerProvider (026, contracts/issuer-provider.md)', () => {
  const stub: IssuerProvider = new StubIssuerProvider();

  it('issues stub_<uuid> cards with a 4-digit last4', async () => {
    const a = await stub.issueCard({ childUserId: 'c', displayName: 'Sara' });
    const b = await stub.issueCard({ childUserId: 'c', displayName: 'Sara' });
    expect(a.cardRef).toMatch(/^stub_[0-9a-f-]{36}$/);
    expect(a.last4).toMatch(/^\d{4}$/);
    expect(a.cardRef).not.toBe(b.cardRef);
  });

  it('freeze, unfreeze and terminate resolve immediately', async () => {
    await expect(stub.freezeCard('x')).resolves.toBeUndefined();
    await expect(stub.unfreezeCard('x')).resolves.toBeUndefined();
    await expect(stub.terminateCard('x')).resolves.toBeUndefined();
  });

  it('parseWebhook throws NotImplementedException', () => {
    expect(() => stub.parseWebhook({}, Buffer.alloc(0))).toThrow(
      NotImplementedException,
    );
  });

  it('formatAuthorizationResponse returns the result unchanged', () => {
    const result = { approved: true, transactionId: 't1' };
    expect(stub.formatAuthorizationResponse(result, {} as never)).toBe(result);
  });
});
