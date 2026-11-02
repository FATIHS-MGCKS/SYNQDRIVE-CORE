import { createHash } from 'node:crypto';
import {
  assertAttestationEvidenceRedaction,
  buildAttestationResponseFingerprint,
  redactUrlToHostPath,
} from './oneauto-sandbox-attestation-response-fingerprint.util';
import { buildSandboxAttestationEvidence } from './oneauto-sandbox-attestation-evidence.util';
import { getDocumentedOneAutoContract } from '../catalog/oneauto-documented-contracts';

describe('OneAuto attestation response fingerprint (P25E-E2)', () => {
  const contract = () => getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU')!;

  it('redacts Location query tokens to host + path only', () => {
    expect(
      redactUrlToHostPath('https://api.oneautoapi.com/ezyvin/status/abc?sig=secret-token'),
    ).toBe('https://api.oneautoapi.com/ezyvin/status/abc');
  });

  it('fingerprints async job id without storing raw value', () => {
    const fp = buildAttestationResponseFingerprint({
      httpStatus: 202,
      body: { success: true, request_id: 'oa-async-req-12345678' },
      headers: { retryAfterRaw: '30', locationRaw: null, providerStatusRaw: 'PENDING' },
    });
    expect(fp.asyncState).toBe('ASYNC_ACCEPTED');
    expect(fp.httpStatusClass).toBe('202');
    expect(fp.retryAfterSeconds).toBe(30);
    expect(fp.providerStatusHeader).toBe('PENDING');
    expect(fp.asyncJobIdFingerprint).toBe(
      createHash('sha256').update('oa-async-req-12345678', 'utf8').digest('hex').slice(0, 16),
    );
    expect(fp.topLevelJsonKeys).toEqual(['request_id', 'success']);
  });

  it('classifies HTTP 200 sync envelope without result payload storage', () => {
    const fp = buildAttestationResponseFingerprint({
      httpStatus: 200,
      body: {
        success: true,
        result: { vehicle_identification_number: 'WBA12345678901234', oem_vehicle_desc: 'Audi A4' },
      },
      headers: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
    });
    expect(fp.asyncState).toBe('SYNC_RESPONSE');
    expect(fp.envelopeSuccessField).toBe(true);
    expect(fp.resultObjectKeys).toContain('vehicle_identification_number');
    expect(fp.sensitiveFieldKeysDetected.some((k) => k.includes('vehicle_identification'))).toBe(true);
  });

  it('marks non-JSON and malformed bodies without embedding raw text', () => {
    const fp = buildAttestationResponseFingerprint({
      httpStatus: 502,
      body: { _nonJsonResponse: true, byteLength: 12 },
      headers: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
    });
    expect(fp.nonJsonBody).toBe(true);
    expect(fp.topLevelJsonKeys).toBeNull();
  });

  it('extracts provider error codes without storing arbitrary error prose', () => {
    const fp = buildAttestationResponseFingerprint({
      httpStatus: 200,
      body: { success: false, error: 'BILLING_REQUIRED', error_code: '402' },
      headers: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
    });
    expect(fp.errorFieldPresent).toBe(true);
    expect(fp.providerErrorCode).toBe('BILLING_REQUIRED');
  });

  it('buildSandboxAttestationEvidence passes redaction gate for sensitive 202 fixture shape', () => {
    const evidence = buildSandboxAttestationEvidence({
      mode: 'offline',
      attestationEnvironment: 'OFFLINE',
      targetHostname: 'sandbox.oneautoapi.com',
      fixtureId: 'http-202-sensitive-fields',
      contract: contract(),
      outcome: {
        httpStatus: 202,
        body: {
          success: true,
          vehicle_identification_number: 'WBA12345678901234',
          api_key: 'super-secret-key',
        },
        responseByteLength: 128,
        envelopeSuccess: null,
        transportErrorCode: null,
        responseHeaders: { retryAfterRaw: null, locationRaw: null, providerStatusRaw: null },
      },
      attemptedOutboundRequests: 1,
      vinForFingerprint: 'WBA12345678901234',
      notes: ['test'],
    });
    expect(evidence.schemaVersion).toBe('oneauto-sandbox-attestation-v2');
    expect(evidence.responseFingerprint.sensitiveFieldKeysDetected.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('super-secret-key');
    expect(serialized).not.toContain('WBA12345678901234');
    assertAttestationEvidenceRedaction(serialized);
  });
});
