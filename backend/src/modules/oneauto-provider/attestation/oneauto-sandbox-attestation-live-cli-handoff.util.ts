import type { OneAutoSandboxAttestationEvidence } from './oneauto-sandbox-attestation.types';
import type { OneAutoAttestationResultCaptureEvidenceMeta } from './oneauto-sandbox-attestation-result-capture.types';

export type OneAutoLiveCliHandoffMetadata = {
  captureWritten: boolean;
  attestationQualified: boolean;
  attemptedOutboundRequests: number;
  evidenceBuildFailed: boolean;
  evidenceBuildErrorCode: string | null;
  stdoutEmitFailed: boolean;
  exitPhase: 'OK' | 'EVIDENCE_BUILD_FAILED' | 'STDOUT_EMIT_FAILED';
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

  return {
    captureWritten,
    attestationQualified: input.evidence.attestationQualified,
    attemptedOutboundRequests: input.evidence.attemptedOutboundRequests,
    evidenceBuildFailed: input.evidenceBuildFailed,
    evidenceBuildErrorCode: input.evidenceBuildErrorCode,
    stdoutEmitFailed: input.stdoutEmitFailed,
    exitPhase,
  };
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
