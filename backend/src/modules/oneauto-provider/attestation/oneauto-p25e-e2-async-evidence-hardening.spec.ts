import { runOfflineSandboxAttestationFixture } from './oneauto-sandbox-attestation.runner';
import { ONEAUTO_SANDBOX_ATTESTATION_FIXTURES } from './oneauto-sandbox-attestation-fixtures';
import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';
import { buildOneAutoDocumentedGetUrl } from '../catalog/oneauto-documented-request.util';
import { ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS } from '../catalog/oneauto-verified-contracts';

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

  describe('provider dashboard async sequence (not SynqDrive second response)', () => {
    it('E1 parity fixture models only the single 202 GET SynqDrive performed', async () => {
      const e1 = await runOfflineSandboxAttestationFixture('http-202-production-e1-parity');
      expect(e1.httpStatus).toBe(202);
      expect(e1.diagnosticCategory).toBe('HTTP_202_ASYNC');
      expect(e1.attestationQualified).toBe(false);
      expect(e1.attemptedOutboundRequests).toBe(1);
      expect(e1.responseFingerprint.asyncState).toBe('ASYNC_ACCEPTED');
      expect((e1.responseByteLength ?? 0) >= 200).toBe(true);
    });

    it('does not treat a separate sync-200 fixture as the provider portal audit row', async () => {
      const portalFollowUpNotSeenBySynqDrive = await runOfflineSandboxAttestationFixture(
        'http-200-success-true',
      );
      expect(portalFollowUpNotSeenBySynqDrive.httpStatus).toBe(200);
      expect(portalFollowUpNotSeenBySynqDrive.responseFingerprint.asyncState).toBe('SYNC_RESPONSE');
      expect(portalFollowUpNotSeenBySynqDrive.notes.some((n) => n.includes('portal'))).toBe(false);
      expect(JSON.stringify(portalFollowUpNotSeenBySynqDrive)).not.toMatch(/is_sqs_call/);
    });

    it('each offline run remains capped at one mocked outbound GET', async () => {
      const fixtures = ['http-202-production-e1-parity', 'http-200-success-true'] as const;
      for (const id of fixtures) {
        const evidence = await runOfflineSandboxAttestationFixture(id);
        expect(evidence.attemptedOutboundRequests).toBeLessThanOrEqual(1);
      }
    });
  });

  it('keeps fixture catalog size aligned', () => {
    expect(ONEAUTO_SANDBOX_ATTESTATION_FIXTURES.length).toBeGreaterThanOrEqual(22);
  });

  describe('documented callback vs attestation transport (offline audit)', () => {
    it('records optional callback query params in DOCUMENTED contract only', () => {
      const doc = getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU')!;
      expect(doc.callbackSupported).toBe(true);
      expect(doc.optionalQueryParameters.map((p) => p.name)).toEqual([
        'callback_url',
        'return_data_in_callback',
      ]);
      const url = buildOneAutoDocumentedGetUrl(
        'https://api.oneautoapi.com',
        doc,
        'WBA12345678901234',
      );
      expect(url).not.toMatch(/callback/i);
    });

    it('registers E1 service history alongside VIN lookup (paid execution still env-gated)', () => {
      expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_SERVICE_HISTORY_EU')).toBe(true);
      expect(ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has('OE_VIN_LOOKUP_EU')).toBe(true);
    });
  });
});
