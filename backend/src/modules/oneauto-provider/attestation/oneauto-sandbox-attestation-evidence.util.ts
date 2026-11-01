import { createHash } from 'node:crypto';
import { normalizeVin } from '../client/oneauto-vin.util';
import type {
  OneAutoSandboxAttestationEvidence,
  OneAutoSandboxAttestationMode,
} from './oneauto-sandbox-attestation.types';
import {
  ONEAUTO_SANDBOX_ATTESTATION_HOST,
  ONEAUTO_SANDBOX_ATTESTATION_SKU,
} from './oneauto-sandbox-attestation.constants';
import type { AttestationTransportOutcome } from './oneauto-sandbox-attestation-evaluate.util';
import {
  attestationQualified,
  classifySandboxAttestationOutcome,
} from './oneauto-sandbox-attestation-evaluate.util';
import type { OneAutoDocumentedProviderContract } from '../catalog/oneauto-contract-types';

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
  fixtureId: string | null;
  contract: Pick<OneAutoDocumentedProviderContract, 'responseEnvelope'>;
  outcome: AttestationTransportOutcome;
  vinForFingerprint?: string | null;
  notes?: string[];
  categoryOverride?: OneAutoSandboxAttestationEvidence['diagnosticCategory'];
}): OneAutoSandboxAttestationEvidence {
  const category =
    input.categoryOverride ??
    classifySandboxAttestationOutcome(input.outcome, input.contract);
  const base: Omit<OneAutoSandboxAttestationEvidence, 'evidenceSha256'> = {
    schemaVersion: 'oneauto-sandbox-attestation-v1',
    recordedAtUtc: new Date().toISOString(),
    targetSku: ONEAUTO_SANDBOX_ATTESTATION_SKU,
    mode: input.mode,
    fixtureId: input.fixtureId,
    sandboxHostname: ONEAUTO_SANDBOX_ATTESTATION_HOST,
    httpMethod: 'GET',
    httpStatus: input.outcome.httpStatus,
    envelopeSuccess: input.outcome.envelopeSuccess,
    responseByteLength: input.outcome.responseByteLength,
    diagnosticCategory: category,
    attestationQualified: attestationQualified(category),
    billingStatus: 'UNKNOWN',
    providerContractStatus: 'DOCUMENTED',
    vinSha256Prefix: vinSha256Prefix(input.vinForFingerprint),
    notes: input.notes ?? [],
  };
  const evidenceSha256 = createHash('sha256').update(stableEvidencePayload(base), 'utf8').digest('hex');
  return { ...base, evidenceSha256 };
}

export function formatAttestationEvidenceMarkdown(evidence: OneAutoSandboxAttestationEvidence): string {
  return [
    '# One Auto sandbox attestation evidence (generated — do not auto-promote)',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| schemaVersion | ${evidence.schemaVersion} |`,
    `| recordedAtUtc | ${evidence.recordedAtUtc} |`,
    `| targetSku | ${evidence.targetSku} |`,
    `| mode | ${evidence.mode} |`,
    `| fixtureId | ${evidence.fixtureId ?? '—'} |`,
    `| sandboxHostname | ${evidence.sandboxHostname} |`,
    `| httpMethod | ${evidence.httpMethod} |`,
    `| httpStatus | ${evidence.httpStatus ?? '—'} |`,
    `| envelopeSuccess | ${evidence.envelopeSuccess ?? '—'} |`,
    `| responseByteLength | ${evidence.responseByteLength ?? '—'} |`,
    `| diagnosticCategory | ${evidence.diagnosticCategory} |`,
    `| attestationQualified | ${evidence.attestationQualified} |`,
    `| billingStatus | ${evidence.billingStatus} |`,
    `| providerContractStatus | ${evidence.providerContractStatus} |`,
    `| vinSha256Prefix | ${evidence.vinSha256Prefix ?? '—'} |`,
    `| evidenceSha256 | ${evidence.evidenceSha256} |`,
    '',
    '## Notes',
    ...(evidence.notes.length > 0 ? evidence.notes.map((n) => `- ${n}`) : ['- (none)']),
    '',
    '**Do not commit API keys, full VINs, or raw provider bodies.**',
  ].join('\n');
}
