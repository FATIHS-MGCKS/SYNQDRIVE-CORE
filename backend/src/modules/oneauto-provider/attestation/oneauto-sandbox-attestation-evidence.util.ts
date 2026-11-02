import { createHash } from 'node:crypto';
import { normalizeVin } from '../client/oneauto-vin.util';
import type {
  OneAutoAttestationEnvironment,
  OneAutoSandboxAttestationEvidence,
  OneAutoSandboxAttestationMode,
} from './oneauto-sandbox-attestation.types';
import {
  ONEAUTO_ATTESTATION_SKU,
  ONEAUTO_PRODUCTION_ATTESTATION_HOST,
  ONEAUTO_SANDBOX_ATTESTATION_HOST,
} from './oneauto-sandbox-attestation.constants';
import type { AttestationTransportOutcome } from './oneauto-sandbox-attestation-evaluate.util';
import {
  attestationQualified,
  classifySandboxAttestationOutcome,
} from './oneauto-sandbox-attestation-evaluate.util';
import type { OneAutoDocumentedProviderContract } from '../catalog/oneauto-contract-types';
import type { OneAutoAttestationResultCaptureEvidenceMeta } from './oneauto-sandbox-attestation-result-capture.types';
import {
  assertAttestationEvidenceRedaction,
  buildAttestationResponseFingerprint,
} from './oneauto-sandbox-attestation-response-fingerprint.util';

const EMPTY_RESPONSE_HEADERS = {
  retryAfterRaw: null,
  locationRaw: null,
  providerStatusRaw: null,
} as const;

function stableEvidencePayload(input: Omit<OneAutoSandboxAttestationEvidence, 'evidenceSha256'>): string {
  return JSON.stringify(input);
}

export function vinSha256Prefix(vin: string | null | undefined): string | null {
  const normalized = normalizeVin(vin);
  if (!normalized) return null;
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

export function buildSandboxAttestationEvidence(input: {
  mode: OneAutoSandboxAttestationMode;
  attestationEnvironment: OneAutoAttestationEnvironment;
  targetHostname: string;
  fixtureId: string | null;
  contract: Pick<OneAutoDocumentedProviderContract, 'responseEnvelope'>;
  outcome: AttestationTransportOutcome;
  attemptedOutboundRequests: number;
  vinForFingerprint?: string | null;
  notes?: string[];
  categoryOverride?: OneAutoSandboxAttestationEvidence['diagnosticCategory'];
  resultCapture?: OneAutoAttestationResultCaptureEvidenceMeta;
}): OneAutoSandboxAttestationEvidence {
  const category =
    input.categoryOverride ??
    classifySandboxAttestationOutcome(input.outcome, input.contract);
  const responseFingerprint = buildAttestationResponseFingerprint({
    httpStatus: input.outcome.httpStatus,
    body: input.outcome.body,
    headers: input.outcome.responseHeaders ?? EMPTY_RESPONSE_HEADERS,
  });
  const base: Omit<OneAutoSandboxAttestationEvidence, 'evidenceSha256'> = {
    schemaVersion: 'oneauto-sandbox-attestation-v2',
    recordedAtUtc: new Date().toISOString(),
    attestationEnvironment: input.attestationEnvironment,
    targetSku: ONEAUTO_ATTESTATION_SKU,
    mode: input.mode,
    fixtureId: input.fixtureId,
    targetHostname: input.targetHostname,
    httpMethod: 'GET',
    httpStatus: input.outcome.httpStatus,
    envelopeSuccess: input.outcome.envelopeSuccess,
    responseByteLength: input.outcome.responseByteLength,
    diagnosticCategory: category,
    attestationQualified: attestationQualified(category),
    attemptedOutboundRequests: input.attemptedOutboundRequests,
    billingStatus: 'UNKNOWN',
    providerContractStatus: 'DOCUMENTED',
    vinSha256Prefix: vinSha256Prefix(input.vinForFingerprint),
    responseFingerprint,
    ...(input.resultCapture ? { resultCapture: input.resultCapture } : {}),
    notes: input.notes ?? [],
  };
  const evidenceSha256 = createHash('sha256').update(stableEvidencePayload(base), 'utf8').digest('hex');
  const evidence = { ...base, evidenceSha256 };
  assertAttestationEvidenceRedaction(JSON.stringify(evidence));
  return evidence;
}

export function offlineEvidenceHostname(): string {
  return ONEAUTO_SANDBOX_ATTESTATION_HOST;
}

export function productionEvidenceHostname(): string {
  return ONEAUTO_PRODUCTION_ATTESTATION_HOST;
}

export function formatAttestationEvidenceMarkdown(evidence: OneAutoSandboxAttestationEvidence): string {
  return [
    '# One Auto attestation evidence (generated — do not auto-commit or auto-promote)',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| schemaVersion | ${evidence.schemaVersion} |`,
    `| recordedAtUtc | ${evidence.recordedAtUtc} |`,
    `| attestationEnvironment | ${evidence.attestationEnvironment} |`,
    `| targetSku | ${evidence.targetSku} |`,
    `| mode | ${evidence.mode} |`,
    `| fixtureId | ${evidence.fixtureId ?? '—'} |`,
    `| targetHostname | ${evidence.targetHostname} |`,
    `| httpMethod | ${evidence.httpMethod} |`,
    `| httpStatus | ${evidence.httpStatus ?? '—'} |`,
    `| envelopeSuccess | ${evidence.envelopeSuccess ?? '—'} |`,
    `| responseByteLength | ${evidence.responseByteLength ?? '—'} |`,
    `| diagnosticCategory | ${evidence.diagnosticCategory} |`,
    `| attestationQualified | ${evidence.attestationQualified} |`,
    `| attemptedOutboundRequests | ${evidence.attemptedOutboundRequests} |`,
    `| billingStatus | ${evidence.billingStatus} |`,
    `| providerContractStatus | ${evidence.providerContractStatus} |`,
    `| vinSha256Prefix | ${evidence.vinSha256Prefix ?? '—'} |`,
    `| responseFingerprint.asyncState | ${evidence.responseFingerprint.asyncState} |`,
    `| responseFingerprint.asyncJobIdFingerprint | ${evidence.responseFingerprint.asyncJobIdFingerprint ?? '—'} |`,
    `| responseFingerprint.retryAfterSeconds | ${evidence.responseFingerprint.retryAfterSeconds ?? '—'} |`,
    `| responseFingerprint.locationHostPathRedacted | ${evidence.responseFingerprint.locationHostPathRedacted ?? '—'} |`,
    `| evidenceSha256 | ${evidence.evidenceSha256} |`,
    '',
    '## Notes',
    ...(evidence.notes.length > 0 ? evidence.notes.map((n) => `- ${n}`) : ['- (none)']),
    '',
    '**Do not commit API keys, full VINs, or raw provider bodies.**',
  ].join('\n');
}
