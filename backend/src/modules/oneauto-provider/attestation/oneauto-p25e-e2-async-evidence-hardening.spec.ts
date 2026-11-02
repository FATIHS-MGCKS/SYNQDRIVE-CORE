import { runOfflineSandboxAttestationFixture } from './oneauto-sandbox-attestation.runner';
import { ONEAUTO_SANDBOX_ATTESTATION_FIXTURES } from './oneauto-sandbox-attestation-fixtures';

describe('OneAuto P25E-E2 async evidence hardening (offline fixtures)', () => {
  it('http-202-with-job-id captures fingerprint metadata only', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-202-with-job-id');
    expect(evidence.diagnosticCategory).toBe('HTTP_202_ASYNC');
    expect(evidence.responseFingerprint.asyncJobIdFingerprint).toHaveLength(16);
    expect(evidence.responseFingerprint.retryAfterSeconds).toBe(15);
    expect(JSON.stringify(evidence)).not.toContain('oa-async-req-12345678');
  });

  it('http-202-with-location redacts Location header query', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-202-with-location');
    expect(evidence.responseFingerprint.locationHostPathRedacted).toBe(
      'https://api.oneautoapi.com/ezyvin/status/abc123',
    );
    expect(JSON.stringify(evidence)).not.toContain('must-not-store');
  });

  it('http-202-without-identifiers fixture remains classified async', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-202');
    expect(evidence.responseFingerprint.asyncJobIdFingerprint).toBeNull();
    expect(evidence.responseFingerprint.asyncState).toBe('ASYNC_ACCEPTED');
  });

  it('http-206 partial content fingerprint', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-206');
    expect(evidence.responseFingerprint.httpStatusClass).toBe('206');
    expect(evidence.responseFingerprint.asyncState).toBe('PARTIAL_CONTENT');
  });

  it('http-202-unexpected-schema records key names only', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-202-unexpected-schema');
    expect(evidence.responseFingerprint.topLevelJsonKeys).toEqual(['meta', 'pending']);
  });

  it('http-202-sensitive-fields never leaks values in evidence JSON', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-202-sensitive-fields');
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toMatch(/Jane Doe/);
    expect(serialized).not.toContain('super-secret-key');
    expect(evidence.responseFingerprint.sensitiveFieldKeysDetected.length).toBeGreaterThan(0);
  });

  it('http-202-malformed-json marks nonJsonBody', async () => {
    const evidence = await runOfflineSandboxAttestationFixture('http-202-malformed-json');
    expect(evidence.responseFingerprint.nonJsonBody).toBe(true);
  });

  it('keeps fixture catalog size aligned', () => {
    expect(ONEAUTO_SANDBOX_ATTESTATION_FIXTURES.length).toBeGreaterThanOrEqual(21);
  });
});
