import { createHash } from 'crypto';
import { stableStringify } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-input-fingerprint.v1';
import type { Ds4RpmDynamicsFusionResearchResultV1 } from '../ds4-rpm-dynamics-fusion-research/ds4-rpm-dynamics-fusion-research.contract.v1';
import type { Ds4RpmShadowCorrelationEventResultV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmShadowCorrelationTripReportV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import type { Ds4RpmRealDataFusionReplayArtifactV1 } from './ds4-rpm-real-data-fusion-replay.contract.v1';
import type { Ds4RpmRealDataSourceAttestationDimensionV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-attestation.contract.v1';

/** Non-semantic metadata excluded from content fingerprint (documented). */
export const DS4_RPM_REAL_DATA_FUSION_REPLAY_FINGERPRINT_EXCLUDES = [
  'deterministicArtifactFingerprint',
  'generatedAtIso',
  'shadowTripReport.provenance.generatedAtIso',
] as const;

function sortAttestationDimensions(
  dimensions: readonly Ds4RpmRealDataSourceAttestationDimensionV1[],
): Ds4RpmRealDataSourceAttestationDimensionV1[] {
  return [...dimensions].sort((a, b) => {
    const byDim = a.dimension.localeCompare(b.dimension);
    if (byDim !== 0) return byDim;
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.reasonCode.localeCompare(b.reasonCode);
  });
}

function sortByEventIndex<T extends { eventIndex: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.eventIndex - b.eventIndex);
}

function fingerprintShadowEvent(event: Ds4RpmShadowCorrelationEventResultV1): Record<string, unknown> {
  return {
    eventIndex: event.eventIndex,
    eventId: event.eventId,
    kind: event.kind,
    startLabelUtc: event.startLabelUtc,
    endLabelUtc: event.endLabelUtc,
    ds4EventQuality: event.ds4EventQuality,
    ds4MeanAccelMps2: event.ds4MeanAccelMps2,
    ds4DurationS: event.ds4DurationS,
    contextClassification: event.contextClassification,
    iceRpmEventApplicability: event.iceRpmEventApplicability,
    reasonCodes: event.reasonCodes,
    cadenceTier: event.cadenceTier,
    cadenceConfidence: event.cadenceConfidence,
    analysisReadiness: event.analysisReadiness,
    qualityExposureContractVersion: event.qualityExposureContractVersion,
    observedRpmPointCountInWindow: event.observedRpmPointCountInWindow,
    eventTemporalSupport: event.eventTemporalSupport,
    admittedWindowCoverageNote: event.admittedWindowCoverageNote,
    rpmMin: event.rpmMin,
    rpmMedian: event.rpmMedian,
    rpmMax: event.rpmMax,
    descriptiveRpmStats: event.descriptiveRpmStats,
    observedSampleSpanMs: event.observedSampleSpanMs,
    sourceTimestampPhase: event.sourceTimestampPhase,
    alignmentEnvelope: event.alignmentEnvelope,
    alignmentSensitivity: event.alignmentSensitivity,
    speedOnlyBaselineNote: event.speedOnlyBaselineNote,
  };
}

function fingerprintShadowTripReport(
  report: Ds4RpmShadowCorrelationTripReportV1,
): Record<string, unknown> {
  const { provenance, ...reportRest } = report;
  const { generatedAtIso: _generatedAtIso, ...provenanceRest } = provenance;
  return {
    ...reportRest,
    events: sortByEventIndex(report.events).map((e) => fingerprintShadowEvent(e)),
    provenance: provenanceRest,
  };
}

function fingerprintFusionResult(
  fusion: Ds4RpmDynamicsFusionResearchResultV1,
): Record<string, unknown> {
  return {
    contractVersion: fusion.contractVersion,
    kernelVersion: fusion.kernelVersion,
    researchOnly: fusion.researchOnly,
    evidenceKind: fusion.evidenceKind,
    organizationId: fusion.organizationId,
    vehicleId: fusion.vehicleId,
    tripId: fusion.tripId,
    providerSourceLinkId: fusion.providerSourceLinkId,
    motionRunId: fusion.motionRunId,
    v1bInputFingerprint: fusion.v1bInputFingerprint,
    a2ContractVersion: fusion.a2ContractVersion,
    a2KernelVersion: fusion.a2KernelVersion,
    telemetrySourceFamily: fusion.telemetrySourceFamily,
    sourceTimestampPhase: fusion.sourceTimestampPhase,
    rpmObservationSupportWidthSeconds: fusion.rpmObservationSupportWidthSeconds,
    status: fusion.status,
    tripReasonCodes: fusion.tripReasonCodes,
    dynamicsTripResult: fusion.dynamicsTripResult,
    events: sortByEventIndex(fusion.events).map((e) => ({
      eventIndex: e.eventIndex,
      motionEvent: e.motionEvent,
      shadowCorrelation: e.shadowCorrelation,
      fusionClassification: e.fusionClassification,
      reasonCodes: e.reasonCodes,
      eventLocalDynamics: e.eventLocalDynamics,
      alignmentHypothesisNote: e.alignmentHypothesisNote,
      alignmentEnvelope: e.alignmentEnvelope,
      dynamicsAlignmentSensitivity: e.dynamicsAlignmentSensitivity,
      scientificLimitationFlags: e.scientificLimitationFlags,
    })),
    scientificGuards: fusion.scientificGuards,
    unsupportedScientificClaims: fusion.unsupportedScientificClaims,
  };
}

export function buildDs4RpmRealDataFusionReplayFingerprintMaterialV1(
  artifact: Ds4RpmRealDataFusionReplayArtifactV1,
): Record<string, unknown> {
  const {
    deterministicArtifactFingerprint: _self,
    generatedAtIso: _generatedAtIso,
    shadowReplay,
    sourceAttestation,
    fusionResult,
    ...semanticArtifact
  } = artifact;

  return {
    ...semanticArtifact,
    codeSha: artifact.codeSha,
    sourceAttestation: {
      contractVersion: sourceAttestation.contractVersion,
      attestationBundleId: sourceAttestation.attestationBundleId,
      cohortVehicleLabel: sourceAttestation.cohortVehicleLabel,
      dimensions: sortAttestationDimensions(sourceAttestation.dimensions),
      abstainReasons: [...sourceAttestation.abstainReasons].sort(),
      correlationEligible: sourceAttestation.correlationEligible,
    },
    shadowReplay: {
      contractVersion: shadowReplay.contractVersion,
      bundleId: shadowReplay.bundleId,
      inputFingerprint: shadowReplay.inputFingerprint,
      eligibility: shadowReplay.eligibility,
      resolvedTelemetrySourceFamily: shadowReplay.resolvedTelemetrySourceFamily,
      abstainReasons: [...shadowReplay.abstainReasons].sort(),
      unsupportedScientificClaims: shadowReplay.unsupportedScientificClaims,
      shadowTripReport: shadowReplay.shadowTripReport
        ? fingerprintShadowTripReport(shadowReplay.shadowTripReport)
        : null,
    },
    fusionResult: fusionResult ? fingerprintFusionResult(fusionResult) : null,
  };
}

export function computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1(
  artifact: Ds4RpmRealDataFusionReplayArtifactV1,
): string {
  const material = buildDs4RpmRealDataFusionReplayFingerprintMaterialV1(artifact);
  return createHash('sha256').update(stableStringify(material)).digest('hex');
}
