import { createHash } from 'node:crypto';
import type { OneAutoSandboxAttestationEvidence } from './oneauto-sandbox-attestation.types';
import type { OneAutoAttestationResultCaptureEvidenceMeta } from './oneauto-sandbox-attestation-result-capture.types';
import { ONEAUTO_ATTESTATION_SKU } from './oneauto-sandbox-attestation.constants';
import type { AttestationTransportOutcome } from './oneauto-sandbox-attestation-evaluate.util';
import { attestationQualified } from './oneauto-sandbox-attestation-evaluate.util';
import {
  assertAttestationEvidenceRedaction,
  buildAttestationResponseFingerprint,
} from './oneauto-sandbox-attestation-response-fingerprint.util';
import { vinSha256Prefix } from './oneauto-sandbox-attestation-evidence.util';

const EMPTY_RESPONSE_HEADERS = {
  retryAfterRaw: null,
  locationRaw: null,
  providerStatusRaw: null,
} as const;

export type OneAutoLiveCliHandoffMetadata = {
  captureWritten: boolean;
  attestationQualified: boolean;
  attemptedOutboundRequests: number;
  evidenceBuildFailed: boolean;
  evidenceBuildErrorCode: string | null;
  stdoutEmitFailed: boolean;
  exitPhase: 'OK' | 'EVIDENCE_BUILD_FAILED' | 'STDOUT_EMIT_FAILED';
  exitCode: number;
};

export function errorCodeFromUnknown(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    const msg = err.message.trim();
    if (/leaked|redaction|credential|vin pattern/i.test(msg)) {
      return 'EVIDENCE_REDACTION_FAILED';
    }
    return 'EVIDENCE_BUILD_FAILED';
  }
  return 'EVIDENCE_BUILD_FAILED';
}

/** Share-safe stderr line for operators — no paths, VIN, API key, or response bodies. */
export function formatLiveCliHandoffMetadataLine(meta: OneAutoLiveCliHandoffMetadata): string {
  return `ONEAUTO_ATTESTATION_CLI_HANDOFF=${JSON.stringify(meta)}`;
}

export function evidenceBuildFailedFromNotes(notes: string[]): boolean {
  return notes.some((n) => n.startsWith('Evidence build fallback:'));
}

export function primaryEvidenceBuildErrorFromNotes(notes: string[]): string | null {
  const line = notes.find((n) => n.startsWith('Evidence build fallback:'));
  if (!line) return null;
  const code = line.slice('Evidence build fallback:'.length).trim();
  return code.length > 0 ? code : 'EVIDENCE_BUILD_FAILED';
}

export function resolveLiveCliExitCode(meta: OneAutoLiveCliHandoffMetadata): number {
  if (meta.captureWritten && meta.attestationQualified) {
    if (meta.evidenceBuildFailed || meta.stdoutEmitFailed) return 3;
    return 0;
  }
  if (meta.attestationQualified) return 0;
  return 2;
}

export function buildLiveCliHandoffMetadata(input: {
  evidence: OneAutoSandboxAttestationEvidence;
  evidenceBuildFailed: boolean;
  evidenceBuildErrorCode: string | null;
  stdoutEmitFailed: boolean;
}): OneAutoLiveCliHandoffMetadata {
  const captureWritten = input.evidence.resultCapture?.written === true;
  let exitPhase: OneAutoLiveCliHandoffMetadata['exitPhase'] = 'OK';
  if (input.stdoutEmitFailed) exitPhase = 'STDOUT_EMIT_FAILED';
  else if (input.evidenceBuildFailed) exitPhase = 'EVIDENCE_BUILD_FAILED';

  const partial = {
    captureWritten,
    attestationQualified: input.evidence.attestationQualified,
    attemptedOutboundRequests: input.evidence.attemptedOutboundRequests,
    evidenceBuildFailed: input.evidenceBuildFailed,
    evidenceBuildErrorCode: input.evidenceBuildErrorCode,
    stdoutEmitFailed: input.stdoutEmitFailed,
    exitPhase,
  };
  return finalizeLiveCliHandoffMetadata(partial);
}

export function finalizeLiveCliHandoffMetadata(
  meta: Omit<OneAutoLiveCliHandoffMetadata, 'exitCode'>,
): OneAutoLiveCliHandoffMetadata {
  const withExit = { ...meta, exitCode: 0 };
  withExit.exitCode = resolveLiveCliExitCode(withExit);
  return withExit;
}

export function emitLiveCliHandoffMetadata(meta: OneAutoLiveCliHandoffMetadata): void {
  console.error(formatLiveCliHandoffMetadataLine(meta));
}

/** Outcome safe for shareable attestation evidence when full-body fingerprint fails redaction gates. */
export function redactOutcomeForShareableEvidence<T extends { body: unknown }>(outcome: T): T {
  return {
    ...outcome,
    body: { _nonJsonResponse: true },
  };
}

export function captureWrittenFromMeta(
  meta: OneAutoAttestationResultCaptureEvidenceMeta | undefined,
): boolean {
  return meta?.written === true;
}

/** Last-resort share-safe evidence when both full and redacted fingerprint builds throw. */
export function buildCapturePreservingHandoffEvidence(input: {
  targetHostname: string;
  outcome: AttestationTransportOutcome;
  attemptedOutboundRequests: number;
  vinForFingerprint?: string | null;
  diagnosticCategory: OneAutoSandboxAttestationEvidence['diagnosticCategory'];
  resultCapture?: OneAutoAttestationResultCaptureEvidenceMeta;
  notes: string[];
}): OneAutoSandboxAttestationEvidence {
  const redactedOutcome = redactOutcomeForShareableEvidence(input.outcome);
  const responseFingerprint = buildAttestationResponseFingerprint({
    httpStatus: redactedOutcome.httpStatus,
    body: redactedOutcome.body,
    headers: redactedOutcome.responseHeaders ?? EMPTY_RESPONSE_HEADERS,
  });
  const base: Omit<OneAutoSandboxAttestationEvidence, 'evidenceSha256'> = {
    schemaVersion: 'oneauto-sandbox-attestation-v2',
    recordedAtUtc: new Date().toISOString(),
    attestationEnvironment: 'PRODUCTION',
    targetSku: ONEAUTO_ATTESTATION_SKU,
    mode: 'live-production',
    fixtureId: null,
    targetHostname: input.targetHostname,
    httpMethod: 'GET',
    httpStatus: input.outcome.httpStatus,
    envelopeSuccess: input.outcome.envelopeSuccess,
    responseByteLength: input.outcome.responseByteLength,
    diagnosticCategory: input.diagnosticCategory,
    attestationQualified: attestationQualified(input.diagnosticCategory),
    attemptedOutboundRequests: input.attemptedOutboundRequests,
    billingStatus: 'UNKNOWN',
    providerContractStatus: 'DOCUMENTED',
    vinSha256Prefix: vinSha256Prefix(input.vinForFingerprint),
    responseFingerprint,
    ...(input.resultCapture ? { resultCapture: input.resultCapture } : {}),
    notes: input.notes,
  };
  const evidenceSha256 = createHash('sha256')
    .update(JSON.stringify(base), 'utf8')
    .digest('hex');
  const evidence = { ...base, evidenceSha256 };
  assertAttestationEvidenceRedaction(JSON.stringify(evidence));
  return evidence;
}
