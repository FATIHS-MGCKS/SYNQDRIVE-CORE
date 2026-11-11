import { hasUncertainHistoricalObdRecordTime, resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { executeDs4RpmDynamicsFusionHarness } from '../ds4-rpm-dynamics-fusion-research/ds4-rpm-dynamics-fusion-research.harness.v1';
import { assertProductionEvidenceSourceNotImplemented } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-offline-evidence.adapter.v1';
import { computeDs4RpmRealDataOfflineBundleInputFingerprintV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-input-fingerprint.v1';
import { validateDs4RpmRealDataOfflineInputBundleV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-input-bundle-validation.v1';
import { executeDs4RpmRealDataOfflineReplayTripV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay-executor.v1';
import { auditDs4RpmRealDataSourceAttestationV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-attestation-audit.v1';
import type { Ds4RpmRealDataPilotReadAuthorizationContextV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-pilot-read-authorization.contract.v1';
import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-scientific-claims.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay.contract.v1';
import { buildDs4RpmRealDataReferenceCohortReadinessMatrixV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-readiness-matrix.v1';
import {
  buildDs4RpmRealDataSourceAttestationBundleFromOfflineInputV1,
  type BuildAttestationFromOfflineBundleOptionsV1,
} from './ds4-rpm-real-data-fusion-replay-attestation-from-bundle.v1';
import {
  DS4_RPM_REAL_DATA_FUSION_REPLAY_CONTRACT_VERSION,
  DS4_RPM_REAL_DATA_FUSION_REPLAY_ORCHESTRATOR_VERSION,
  type Ds4RpmRealDataFusionReplayArtifactV1,
  type Ds4RpmRealDataFusionReplayEvidencePolicyV1,
  type Ds4RpmRealDataFusionReplayOutcomeLabelV1,
} from './ds4-rpm-real-data-fusion-replay.contract.v1';
import { computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1 } from './ds4-rpm-real-data-fusion-replay-fingerprint.v1';

export type Ds4RpmRealDataFusionOfflineReplayOptionsV1 = {
  codeSha: string;
  generatedAt?: Date;
  productionEvidenceSource?: null;
  fusionEvidencePolicy?: Ds4RpmRealDataFusionReplayEvidencePolicyV1;
  authorizationContext?: Ds4RpmRealDataPilotReadAuthorizationContextV1 | null;
  trustedEvaluatedAtIso?: string | null;
  attestationBundleOverrides?: BuildAttestationFromOfflineBundleOptionsV1;
};

const FUSION_LIMITATIONS = [
  'LABEL_TIME_HYPOTHESIS_NOT_PHYSICAL_SYNC',
  'SOURCE_TIMESTAMP_PHASE_UNKNOWN',
  'RPM_OBSERVATION_SUPPORT_WIDTH_UNKNOWN',
  'INJECTED_OFFLINE_BUNDLE_NOT_FIELD_VALIDATION',
  'ATTESTATION_BUNDLE_NOT_INDEPENDENT_PROOF',
] as const;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function executeDs4RpmRealDataFusionOfflineReplayV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
  options: Ds4RpmRealDataFusionOfflineReplayOptionsV1,
): Ds4RpmRealDataFusionReplayArtifactV1 {
  assertProductionEvidenceSourceNotImplemented(options.productionEvidenceSource ?? null);

  const generatedAt = options.generatedAt ?? new Date('2026-11-04T08:00:00.000Z');
  const fusionEvidencePolicy = options.fusionEvidencePolicy ?? 'OFFLINE_INJECTED_SYNTHETIC_GATE';
  const inputFingerprint = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(bundle);
  const rpmInputFingerprint = bundle.v1bResult
    ? computeDs4RpmHfV1bTierAwareInputFingerprint(bundle.tripInput)
    : null;

  const outcomeLabels: Ds4RpmRealDataFusionReplayOutcomeLabelV1[] = [];
  const blockingReasons: string[] = [];
  const missingEvidence: string[] = [];

  const validation = validateDs4RpmRealDataOfflineInputBundleV1(bundle);
  const attestationBundle = buildDs4RpmRealDataSourceAttestationBundleFromOfflineInputV1(
    bundle,
    options.attestationBundleOverrides ?? {},
  );
  const sourceAttestation = auditDs4RpmRealDataSourceAttestationV1(attestationBundle, {
    authorizationContext: options.authorizationContext ?? null,
    trustedEvaluatedAtIso: options.trustedEvaluatedAtIso ?? null,
  });

  const completenessMatrix = sourceAttestation.dimensions.map((d) => ({
    dimension: d.dimension,
    state: d.state,
    reasonCode: d.reasonCode,
  }));

  let sourceAttestationVerdict: Ds4RpmRealDataFusionReplayArtifactV1['sourceAttestationVerdict'] =
    'SOURCE_NOT_ATTESTED';
  if (sourceAttestation.dimensions.some((d) => d.state === 'BLOCKED')) {
    sourceAttestationVerdict = 'BLOCKED';
  } else if (sourceAttestation.correlationEligible) {
    sourceAttestationVerdict = 'ATTESTED_FOR_OFFLINE_INJECTION_ONLY';
  } else {
    sourceAttestationVerdict = 'SOURCE_NOT_ATTESTED';
    outcomeLabels.push('SOURCE_NOT_ATTESTED');
    for (const r of sourceAttestation.abstainReasons) {
      missingEvidence.push(r);
    }
  }

  if (!validation.ok) {
    blockingReasons.push(...validation.reasonCodes);
    if (validation.reasonCodes.includes('TELEMETRY_SOURCE_FAMILY_UNKNOWN')) {
      blockingReasons.push('UNKNOWN_TELEMETRY_SOURCE');
    }
  }

  const family =
    validation.ok ? validation.resolvedTelemetrySourceFamily : resolveTelemetrySourceFamily(bundle.dimoVehicleRawJson);

  const shadowReplay = executeDs4RpmRealDataOfflineReplayTripV1(bundle, {
    codeSha: options.codeSha,
    generatedAt,
  });

  if (shadowReplay.shadowTripReport) {
    outcomeLabels.push('RESEARCH_REPLAY_EXECUTED');
  }

  outcomeLabels.push('TEMPORAL_ALIGNMENT_UNVERIFIED');

  const r1VetoActive =
    family === 'RUPTELA_R1' ||
    hasUncertainHistoricalObdRecordTime(family) ||
    shadowReplay.abstainReasons.includes('ELIGIBILITY_BLOCKED');

  const r1Reasons = uniqueSorted([
    ...(r1VetoActive ? ['R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED'] : []),
    ...shadowReplay.abstainReasons.filter((r) => r.includes('R1') || r.includes('ELIGIBILITY')),
  ]);

  let fusionResult = null;
  const fusionBlockReasons: string[] = [];

  if (fusionEvidencePolicy === 'REAL_OBSERVATION_REQUESTED') {
    outcomeLabels.push('FUSION_NOT_AUTHORIZED');
    fusionBlockReasons.push('REAL_OBSERVATION_FUSION_REQUIRES_INDEPENDENT_AUTHORITY');
    fusionBlockReasons.push('FUSION_SYNTHETIC_GATE_REJECTS_REAL_OBSERVATION');
    blockingReasons.push(...fusionBlockReasons);
  } else if (!validation.ok || !bundle.v1bResult) {
    fusionBlockReasons.push('BUNDLE_OR_V1B_NOT_DEFENSIBLE');
    outcomeLabels.push('FUSION_NOT_AUTHORIZED');
  } else if (r1VetoActive) {
    fusionBlockReasons.push('R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED');
    outcomeLabels.push('FUSION_NOT_AUTHORIZED');
  } else if (!shadowReplay.shadowTripReport) {
    fusionBlockReasons.push('SHADOW_REPLAY_UNAVAILABLE');
    outcomeLabels.push('FUSION_NOT_AUTHORIZED');
  } else {
    fusionResult = executeDs4RpmDynamicsFusionHarness({
      organizationId: bundle.organizationId,
      vehicleId: bundle.vehicleId,
      tripId: bundle.tripId,
      motionRunId: bundle.motionRunId,
      motionPayload: bundle.motionPayload,
      tripInput: bundle.tripInput,
      v1bResult: bundle.v1bResult,
      v1bRunId: bundle.v1bRunId,
      rpmSamples: {
        source: 'PINNED_FIXTURE',
        inputFingerprint: rpmInputFingerprint!,
        providerSourceLinkId: bundle.providerSourceLinkId,
        telemetrySourceFamily: family === 'UNKNOWN' ? null : family,
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        points: bundle.tripInput.rpmPoints.map((p) => ({ ...p })),
        invalidValueCount: bundle.tripInput.dataQuality.invalidValueCount,
        duplicateTimestampCount: bundle.tripInput.dataQuality.duplicateTimestampCount,
      },
      evidenceKind: 'SYNTHETIC_FIXTURE',
      dimoVehicleRawJson: bundle.dimoVehicleRawJson,
    });
    if (fusionResult.status !== 'COMPUTED') {
      outcomeLabels.push('FUSION_NOT_AUTHORIZED');
      fusionBlockReasons.push(...fusionResult.tripReasonCodes);
    }
  }

  if (fusionResult == null && fusionEvidencePolicy !== 'REAL_OBSERVATION_REQUESTED') {
    if (!outcomeLabels.includes('FUSION_NOT_AUTHORIZED') && blockingReasons.length > 0) {
      outcomeLabels.push('FUSION_NOT_AUTHORIZED');
    }
  }

  const shadowEvents = shadowReplay.shadowTripReport?.events ?? [];
  let alignmentProbeCount = 0;
  if (fusionResult) {
    for (const e of fusionResult.events) {
      alignmentProbeCount += e.dynamicsAlignmentSensitivity.length;
    }
  }

  let gapDeficiencyCount = 0;
  for (const e of shadowEvents) {
    if (e.eventTemporalSupport?.gapDeficiencySeconds != null) {
      gapDeficiencyCount += 1;
    }
  }

  const fusionComputedEvents = fusionResult?.events.filter((e) => e.fusionClassification !== 'UNAVAILABLE').length ?? 0;

  const readiness = buildDs4RpmRealDataReferenceCohortReadinessMatrixV1();

  const artifactWithoutFingerprint: Omit<Ds4RpmRealDataFusionReplayArtifactV1, 'deterministicArtifactFingerprint'> = {
    contractVersion: DS4_RPM_REAL_DATA_FUSION_REPLAY_CONTRACT_VERSION,
    orchestratorVersion: DS4_RPM_REAL_DATA_FUSION_REPLAY_ORCHESTRATOR_VERSION,
    researchOnly: true,
    executionBoundary: 'OFFLINE_INJECTED_BUNDLE_ONLY',
    codeSha: options.codeSha,
    generatedAtIso: generatedAt.toISOString(),
    bundleId: bundle.bundleId,
    inputFingerprint,
    rpmInputFingerprint,
    outcomeLabels: uniqueSorted(outcomeLabels) as Ds4RpmRealDataFusionReplayOutcomeLabelV1[],
    blockingReasons: uniqueSorted([...blockingReasons, ...fusionBlockReasons]),
    missingEvidenceInventory: uniqueSorted([
      ...missingEvidence,
      ...readiness.openUncertainties,
    ]),
    identity: {
      cohortVehicleLabel: bundle.cohortVehicleLabel,
      organizationId: bundle.organizationId,
      vehicleId: bundle.vehicleId,
      tripId: bundle.tripId,
      providerSourceLinkId: bundle.providerSourceLinkId,
    },
    completenessMatrix,
    sourceAttestation,
    sourceAttestationVerdict,
    shadowReplay,
    fusionResult,
    fusionEligibility: {
      authorized: fusionResult?.status === 'COMPUTED',
      a2DynamicsStatus:
        fusionResult == null
          ? 'NOT_RUN'
          : fusionResult.dynamicsTripResult?.status === 'COMPUTED'
            ? 'COMPUTED'
            : 'UNAVAILABLE',
      ds4EventCoverage: {
        eventCount: shadowEvents.length,
        fusionComputedEventCount: fusionComputedEvents,
      },
      reasonCodes: uniqueSorted(fusionBlockReasons),
    },
    alignmentDiagnostics: {
      sourceTimestampPhase: 'UNKNOWN',
      rpmObservationSupportWidthSeconds: 'UNKNOWN',
      shadowGapDeficiencyEventCount: gapDeficiencyCount,
      alignmentSensitivityProbeCount: alignmentProbeCount,
      limitations: [...FUSION_LIMITATIONS],
    },
    motionProvenance: {
      motionRunId: bundle.motionRunId,
      motionEventCount: bundle.motionPayload.events.length,
      motionPayloadIntegrity: validation.ok ? 'BOUND_TO_OFFLINE_BUNDLE' : 'REJECTED',
      ds4SpeedBucketCount: bundle.motionPayload.speeds.length,
    },
    r1Containment: {
      historicalRpmPointTimeFusionForbidden: true,
      family,
      r1VetoActive,
      reasonCodes: r1Reasons,
    },
    realObservationStatus: {
      shadowProhibitionEffective: true,
      fusionPathAllowed: fusionEvidencePolicy === 'OFFLINE_INJECTED_SYNTHETIC_GATE' && fusionResult?.status === 'COMPUTED',
      policy: fusionEvidencePolicy,
      blockingReasonCodes: uniqueSorted(
        fusionEvidencePolicy === 'REAL_OBSERVATION_REQUESTED'
          ? [
              'REAL_OBSERVATION_FUSION_REQUIRES_INDEPENDENT_AUTHORITY',
              'FUSION_SYNTHETIC_GATE_REJECTS_REAL_OBSERVATION',
            ]
          : [],
      ),
    },
    scientificLimitations: [...FUSION_LIMITATIONS],
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
  };

  const deterministicArtifactFingerprint =
    computeDs4RpmRealDataFusionReplayDeterministicFingerprintV1({
      ...artifactWithoutFingerprint,
      deterministicArtifactFingerprint: 'pending',
    });

  return {
    ...artifactWithoutFingerprint,
    deterministicArtifactFingerprint,
  };
}
