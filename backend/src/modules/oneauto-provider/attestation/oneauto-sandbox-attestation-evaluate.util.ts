import type { OneAutoDocumentedProviderContract } from '../catalog/oneauto-contract-types';
import { evaluateSuccessResultErrorEnvelope } from '../oneauto-response-envelope.util';
import type { OneAutoSandboxAttestationDiagnosticCategory } from './oneauto-sandbox-attestation.types';

export type AttestationTransportOutcome = {
  httpStatus: number | null;
  body: unknown;
  responseByteLength: number | null;
  envelopeSuccess: boolean | null;
  transportErrorCode: string | null;
};

export function classifySandboxAttestationOutcome(
  outcome: AttestationTransportOutcome,
  contract: Pick<OneAutoDocumentedProviderContract, 'responseEnvelope'>,
): OneAutoSandboxAttestationDiagnosticCategory {
  if (outcome.transportErrorCode === 'ONEAUTO_INVALID_VIN') return 'INVALID_VIN';
  if (outcome.transportErrorCode === 'ONEAUTO_ATTESTATION_REQUEST_BUDGET_EXCEEDED') {
    return 'REQUEST_BUDGET_EXCEEDED';
  }
  if (outcome.transportErrorCode === 'ONEAUTO_ATTESTATION_SANDBOX_HOST_FORBIDDEN') {
    return 'SANDBOX_HOST_REJECTED';
  }
  if (outcome.transportErrorCode === 'ONEAUTO_ATTESTATION_CUSTOM_HOST_FORBIDDEN') {
    return 'CUSTOM_HOST_REJECTED';
  }
  if (outcome.transportErrorCode === 'ONEAUTO_UNEXPECTED_REDIRECT') return 'REDIRECT';
  if (outcome.transportErrorCode === 'ONEAUTO_RESPONSE_TOO_LARGE') return 'RESPONSE_TOO_LARGE';
  if (outcome.transportErrorCode === 'ONEAUTO_PROVIDER_TIMEOUT') return 'TIMEOUT';
  if (
    outcome.transportErrorCode === 'ONEAUTO_PROVIDER_REQUEST_FAILED' ||
    outcome.transportErrorCode === 'ONEAUTO_ATTESTATION_NETWORK'
  ) {
    return 'NETWORK_FAILURE';
  }

  const status = outcome.httpStatus;
  if (status == null) return 'NETWORK_FAILURE';

  if (status >= 300 && status < 400) return 'REDIRECT';
  if (status === 202) return 'HTTP_202_ASYNC';
  if (status === 206) return 'HTTP_206_PARTIAL';
  if (status === 401) return 'HTTP_UNAUTHORIZED';
  if (status === 403) return 'HTTP_FORBIDDEN';
  if (status === 429) return 'HTTP_RATE_LIMIT';
  if (status >= 500) return 'HTTP_SERVER_ERROR';

  if (status === 200) {
    const body = outcome.body;
    if (
      body != null &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      (body as Record<string, unknown>)._nonJsonResponse === true
    ) {
      return 'NON_JSON_RESPONSE';
    }
    const envelope = evaluateSuccessResultErrorEnvelope(status, body, contract);
    if (!envelope.ok) {
      return envelope.code === 'ONEAUTO_PROVIDER_ENVELOPE_FAILURE'
        ? 'ENVELOPE_FAILURE'
        : 'ENVELOPE_MALFORMED';
    }
    return 'SYNC_ATTESTATION_SUCCESS';
  }

  if (status >= 400) return 'HTTP_OTHER_ERROR';
  return 'HTTP_OTHER_ERROR';
}

export function attestationQualified(category: OneAutoSandboxAttestationDiagnosticCategory): boolean {
  return category === 'SYNC_ATTESTATION_SUCCESS';
}
