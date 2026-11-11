import { createHash } from 'crypto';
import { stableStringify } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-input-fingerprint.v1';
import type { Ds4RpmRealDataFusionReplayArtifactV1 } from './ds4-rpm-real-data-fusion-replay.contract.v1';

/** Non-semantic metadata excluded from content fingerprint (documented). */
export const DS4_RPM_REAL_DATA_FUSION_REPLAY_FINGERPRINT_EXCLUDES = [
  'deterministicArtifactFingerprint',
  'generatedAtIso',
] as const;

function redactForFingerprint(
  artifact: Ds4RpmRealDataFusionReplayArtifactV1,
): Record<string, unknown> {
  const {
    deterministicArtifactFingerprint: _fp,
    generatedAtIso: _at,
    shadowReplay,
    sourceAttestation,
    fusionResult,
    ...rest
  } = artifact;

  return {
    ...rest,
    codeSha: artifact.codeSha,
    sourceAttestation: {
      attestationBundleId: sourceAttestation.attestationBundleId,
      cohortVehicleLabel: sourceAttestation.cohortVehicleLabel,
      dimensions: sourceAttestation.dimensions,
      abstainReasons: sourceAttestation.abstainReasons,
      correlationEligible: sourceAttestation.correlationEligible,
    },
    shadowReplay: {
      bundleId: shadowReplay.bundleId,
      inputFingerprint: shadowReplay.inputFingerprint,
      eligibility: shadowReplay.eligibility,
      resolvedTelemetrySourceFamily: shadowReplay.resolvedTelemetrySourceFamily,
      abstainReasons: shadowReplay.abstainReasons,
      shadowTripReport: shadowReplay.shadowTripReport
        ? {
            summary: shadowReplay.shadowTripReport.summary,
            eventCount: shadowReplay.shadowTripReport.events.length,
            eventFingerprints: shadowReplay.shadowTripReport.events.map((e) => ({
              eventIndex: e.eventIndex,
              contextClassification: e.contextClassification,
              reasonCodes: e.reasonCodes,
            })),
          }
        : null,
    },
    fusionResult: fusionResult
      ? {
          status: fusionResult.status,
          evidenceKind: fusionResult.evidenceKind,
          tripReasonCodes: fusionResult.tripReasonCodes,
          motionRunId: fusionResult.motionRunId,
          v1bInputFingerprint: fusionResult.v1bInputFingerprint,
          eventSummary: fusionResult.events.map((e) => ({
            eventIndex: e.eventIndex,
            fusionClassification: e.fusionClassification,
            reasonCodes: e.reasonCodes,
            shadowContext: e.shadowCorrelation.contextClassification,
          })),
          dynamicsStatus: fusionResult.dynamicsTripResult?.status ?? null,
        }
      : null,
    alignmentDiagnostics: artifact.alignmentDiagnostics,
    motionProvenance: artifact.motionProvenance,
    researchReplayStatus: artifact.researchReplayStatus,
    syntheticFusionStatus: artifact.syntheticFusionStatus,
    realObservationStatus: artifact.realObservationStatus,
  };
}

export function computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(
  artifact: Ds4RpmRealDataFusionReplayArtifactV1,
): string {
  const material = redactForFingerprint(artifact);
  return createHash('sha256').update(stableStringify(material)).digest('hex');
}
