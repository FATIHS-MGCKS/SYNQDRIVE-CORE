import type { OneAutoSandboxAttestationFixture } from './oneauto-sandbox-attestation.types';

const JSON_200_SUCCESS = JSON.stringify({ success: true, result: { vehicle_identification_number: 'REDACTED' } });

export const ONEAUTO_SANDBOX_ATTESTATION_FIXTURES: readonly OneAutoSandboxAttestationFixture[] = [
  {
    id: 'http-200-success-true',
    description: 'HTTP 200 with success true',
    mock: { kind: 'response', status: 200, bodyText: JSON_200_SUCCESS },
    expectQualified: true,
    expectCategory: 'SYNC_ATTESTATION_SUCCESS',
  },
  {
    id: 'http-200-success-false',
    description: 'HTTP 200 with success false',
    mock: {
      kind: 'response',
      status: 200,
      bodyText: JSON.stringify({ success: false, error: 'provider failure' }),
    },
    expectQualified: false,
    expectCategory: 'ENVELOPE_FAILURE',
  },
  {
    id: 'http-200-missing-success',
    description: 'HTTP 200 missing success field',
    mock: { kind: 'response', status: 200, bodyText: JSON.stringify({ result: {} }) },
    expectQualified: false,
    expectCategory: 'ENVELOPE_MALFORMED',
  },
  {
    id: 'http-200-malformed-success',
    description: 'HTTP 200 non-boolean success',
    mock: { kind: 'response', status: 200, bodyText: JSON.stringify({ success: 'yes' }) },
    expectQualified: false,
    expectCategory: 'ENVELOPE_MALFORMED',
  },
  {
    id: 'http-202',
    description: 'HTTP 202 async pending',
    mock: { kind: 'response', status: 202, bodyText: JSON.stringify({ success: true }) },
    expectQualified: false,
    expectCategory: 'HTTP_202_ASYNC',
  },
  {
    id: 'http-206',
    description: 'HTTP 206 partial',
    mock: { kind: 'response', status: 206, bodyText: JSON.stringify({ success: true }) },
    expectQualified: false,
    expectCategory: 'HTTP_206_PARTIAL',
  },
  {
    id: 'http-302-redirect',
    description: 'HTTP 302 redirect',
    mock: { kind: 'response', status: 302, bodyText: '' },
    expectQualified: false,
    expectCategory: 'REDIRECT',
  },
  {
    id: 'http-401',
    description: 'HTTP 401 unauthorized',
    mock: { kind: 'response', status: 401, bodyText: JSON.stringify({ success: false }) },
    expectQualified: false,
    expectCategory: 'HTTP_UNAUTHORIZED',
  },
  {
    id: 'http-403',
    description: 'HTTP 403 forbidden',
    mock: { kind: 'response', status: 403, bodyText: '{}' },
    expectQualified: false,
    expectCategory: 'HTTP_FORBIDDEN',
  },
  {
    id: 'http-429',
    description: 'HTTP 429 rate limit',
    mock: { kind: 'response', status: 429, bodyText: '{}' },
    expectQualified: false,
    expectCategory: 'HTTP_RATE_LIMIT',
  },
  {
    id: 'http-500',
    description: 'HTTP 500 server error',
    mock: { kind: 'response', status: 500, bodyText: 'error' },
    expectQualified: false,
    expectCategory: 'HTTP_SERVER_ERROR',
  },
  {
    id: 'timeout',
    description: 'Abort / timeout',
    mock: { kind: 'reject', error: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
    expectQualified: false,
    expectCategory: 'TIMEOUT',
  },
  {
    id: 'network-failure',
    description: 'Network failure',
    mock: { kind: 'reject', error: new Error('network down') },
    expectQualified: false,
    expectCategory: 'NETWORK_FAILURE',
  },
  {
    id: 'non-json',
    description: 'Non-JSON body on 200',
    mock: { kind: 'response', status: 200, bodyText: 'not-json-at-all' },
    expectQualified: false,
    expectCategory: 'NON_JSON_RESPONSE',
  },
  {
    id: 'oversized',
    description: 'Response exceeds attestation byte cap',
    mock: { kind: 'response', status: 200, bodyText: 'x'.repeat(512) },
    expectQualified: false,
    expectCategory: 'RESPONSE_TOO_LARGE',
  },
  {
    id: 'invalid-vin',
    description: 'Invalid VIN blocks before fetch',
    mock: { kind: 'invalid-vin' },
    expectQualified: false,
    expectCategory: 'INVALID_VIN',
  },
] as const;

export function getSandboxAttestationFixture(id: string): OneAutoSandboxAttestationFixture | undefined {
  return ONEAUTO_SANDBOX_ATTESTATION_FIXTURES.find((f) => f.id === id);
}
