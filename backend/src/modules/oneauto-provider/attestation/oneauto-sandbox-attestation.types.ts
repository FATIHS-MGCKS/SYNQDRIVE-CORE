import type { ONEAUTO_ATTESTATION_SKU } from './oneauto-sandbox-attestation.constants';

export type OneAutoAttestationEnvironment = 'OFFLINE' | 'PRODUCTION';

export type OneAutoSandboxAttestationMode = 'offline' | 'live-production';

export type OneAutoSandboxAttestationDiagnosticCategory =
  | 'SYNC_ATTESTATION_SUCCESS'
  | 'ENVELOPE_FAILURE'
  | 'ENVELOPE_MALFORMED'
  | 'HTTP_202_ASYNC'
  | 'HTTP_206_PARTIAL'
  | 'REDIRECT'
  | 'HTTP_UNAUTHORIZED'
  | 'HTTP_FORBIDDEN'
  | 'HTTP_RATE_LIMIT'
  | 'HTTP_SERVER_ERROR'
  | 'HTTP_OTHER_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'NON_JSON_RESPONSE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_VIN'
  | 'MISSING_VIN'
  | 'LIVE_OWNER_AUTHORIZATION_REQUIRED'
  | 'MISSING_VIN_USE_AUTHORIZATION'
  | 'MISSING_BILLING_ACKNOWLEDGEMENT'
  | 'MISSING_ONE_GET_CONFIRMATION'
  | 'MISSING_API_KEY'
  | 'LIVE_PRODUCTION_CLI_REQUIRED'
  | 'SANDBOX_HOST_REJECTED'
  | 'CUSTOM_HOST_REJECTED'
  | 'PRODUCTION_HOST_FORBIDDEN'
  | 'REQUEST_BUDGET_EXCEEDED'
  | 'FIXTURE_UNKNOWN';

export type OneAutoSandboxAttestationEvidence = {
  schemaVersion: 'oneauto-sandbox-attestation-v1';
  recordedAtUtc: string;
  attestationEnvironment: OneAutoAttestationEnvironment;
  targetSku: typeof ONEAUTO_ATTESTATION_SKU;
  mode: OneAutoSandboxAttestationMode;
  fixtureId: string | null;
  targetHostname: string;
  httpMethod: 'GET';
  httpStatus: number | null;
  envelopeSuccess: boolean | null;
  responseByteLength: number | null;
  diagnosticCategory: OneAutoSandboxAttestationDiagnosticCategory;
  attestationQualified: boolean;
  attemptedOutboundRequests: number;
  billingStatus: 'UNKNOWN';
  providerContractStatus: 'DOCUMENTED';
  vinSha256Prefix: string | null;
  evidenceSha256: string;
  notes: string[];
};

export type OneAutoSandboxAttestationFixtureMock =
  | {
      kind: 'response';
      status: number;
      bodyText?: string;
      headers?: Record<string, string>;
    }
  | { kind: 'reject'; error: Error }
  | { kind: 'invalid-vin' };

export type OneAutoSandboxAttestationFixture = {
  id: string;
  description: string;
  mock: OneAutoSandboxAttestationFixtureMock;
  expectQualified: boolean;
  expectCategory: OneAutoSandboxAttestationDiagnosticCategory;
};

export type ProductionAttestationAuthorization = {
  cliLiveProduction: boolean;
  apiKey: string | undefined;
  vin: string | undefined;
  ownerAuthorized: string | undefined;
  vinUseAuthorized: string | undefined;
  billingAcknowledged: string | undefined;
  oneGetConfirmed: string | undefined;
};
