import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { executeDs4RpmShadowCorrelationHarness } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';
import type { Ds4RpmShadowCorrelationRpmSampleEvidenceV1 } from '../ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-v1.contract';
import { auditDs4RpmRealDataSourceEligibilityV1 } from './ds4-rpm-real-data-source-eligibility-audit.v1';
import { buildDs4RpmRealDataEligibilityInputFromOfflineBundleV1 } from './ds4-rpm-real-data-eligibility-input.v1';
import { computeDs4RpmRealDataOfflineBundleInputFingerprintV1 } from './ds4-rpm-real-data-input-fingerprint.v1';
import { validateDs4RpmRealDataOfflineInputBundleV1 } from './ds4-rpm-real-data-input-bundle-validation.v1';
import { assertProductionEvidenceSourceNotImplemented } from './ds4-rpm-real-data-offline-evidence.adapter.v1';
import type {
  Ds4RpmRealDataOfflineInputBundleV1,
  Ds4RpmRealDataReplayExecutorAbstainReason,
  Ds4RpmRealDataReplayTripArtifactV1,
} from './ds4-rpm-real-data-replay.contract.v1';
import { DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION } from './ds4-rpm-real-data-replay.contract.v1';

import { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS } from './ds4-rpm-real-data-scientific-claims.v1';

export { DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS };

export type Ds4RpmRealDataReplayExecutorOptionsV1 = {
  codeSha: string;
  generatedAt?: Date;
  productionEvidenceSource?: null;
};

function buildRpmSamples(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
  fingerprint: string,
  family: 'RUPTELA_R1' | 'API_SYNTHETIC' | 'UNKNOWN',
): Ds4RpmShadowCorrelationRpmSampleEvidenceV1 | null {
  if (bundle.tripInput.rpmPoints.length === 0) {
    return {
      source: 'PINNED_FIXTURE',
      inputFingerprint: fingerprint,
      providerSourceLinkId: bundle.providerSourceLinkId,
      telemetrySourceFamily: family === 'UNKNOWN' ? null : family,
      sourceFamilyAttestation:
        family === 'UNKNOWN' ? 'UNPROVEN' : 'PROVEN_FROM_DIMO_IDENTITY',
      points: [],
      invalidValueCount: bundle.tripInput.dataQuality.invalidValueCount,
      duplicateTimestampCount: bundle.tripInput.dataQuality.duplicateTimestampCount,
    };
  }
  return {
    source: 'PINNED_FIXTURE',
    inputFingerprint: fingerprint,
    providerSourceLinkId: bundle.providerSourceLinkId,
    telemetrySourceFamily: family === 'UNKNOWN' ? null : family,
    sourceFamilyAttestation: family === 'UNKNOWN' ? 'UNPROVEN' : 'PROVEN_FROM_DIMO_IDENTITY',
    points: bundle.tripInput.rpmPoints.map((p) => ({ ...p })),
    invalidValueCount: bundle.tripInput.dataQuality.invalidValueCount,
    duplicateTimestampCount: bundle.tripInput.dataQuality.duplicateTimestampCount,
  };
}

export function executeDs4RpmRealDataOfflineReplayTripV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
  options: Ds4RpmRealDataReplayExecutorOptionsV1,
): Ds4RpmRealDataReplayTripArtifactV1 {
  assertProductionEvidenceSourceNotImplemented(options.productionEvidenceSource ?? null);

  const abstainReasons: Ds4RpmRealDataReplayExecutorAbstainReason[] = [
    'OFFLINE_BUNDLE_ONLY',
  ];
  const inputFingerprint = computeDs4RpmRealDataOfflineBundleInputFingerprintV1(bundle);
  const validation = validateDs4RpmRealDataOfflineInputBundleV1(bundle);

  if (!validation.ok) {
    abstainReasons.push('BUNDLE_IDENTITY_BINDING_FAILED');
    if (validation.reasonCodes.includes('TELEMETRY_SOURCE_FAMILY_UNKNOWN')) {
      abstainReasons.push('SOURCE_FAMILY_UNKNOWN');
    }
    const eligibility = auditDs4RpmRealDataSourceEligibilityV1(
      buildDs4RpmRealDataEligibilityInputFromOfflineBundleV1({
        bundle,
        telemetrySourceFamily: 'UNKNOWN',
        sourceFamilyAttestation: 'NOT_COLLECTED',
      }),
    );
    return {
      contractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
      bundleId: bundle.bundleId,
      inputFingerprint,
      eligibility,
      resolvedTelemetrySourceFamily: 'UNKNOWN',
      abstainReasons: [...new Set(abstainReasons)],
      shadowTripReport: null,
      unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
    };
  }

  const family = validation.resolvedTelemetrySourceFamily;
  const eligibility = auditDs4RpmRealDataSourceEligibilityV1(
    buildDs4RpmRealDataEligibilityInputFromOfflineBundleV1({
      bundle,
      telemetrySourceFamily: family,
      sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
    }),
  );

  if (eligibility.overallVerdict === 'BLOCKED') {
    abstainReasons.push('ELIGIBILITY_BLOCKED');
  }
  if (eligibility.overallVerdict === 'NOT_APPLICABLE') {
    abstainReasons.push('ELIGIBILITY_NOT_APPLICABLE');
  }

  const fingerprint = computeDs4RpmHfV1bTierAwareInputFingerprint(bundle.tripInput);
  const rpmSamples = buildRpmSamples(bundle, fingerprint, family);

  const generatedAt = options.generatedAt ?? new Date('2026-11-04T08:00:00.000Z');

  const shadowTripReport = executeDs4RpmShadowCorrelationHarness({
    scenarioId: bundle.scenarioLabel,
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    tripId: bundle.tripId,
    motionRunId: bundle.motionRunId,
    motionPayload: bundle.motionPayload,
    tripInput: bundle.tripInput,
    v1bResult: bundle.v1bResult,
    v1bInputFingerprint: fingerprint,
    v1bRunId: bundle.v1bRunId,
    rpmSamples,
    evidenceKind: 'SYNTHETIC_FIXTURE',
    codeSha: options.codeSha,
    generatedAt,
    omissions: ['PR_B2_OFFLINE_INJECTED_BUNDLE_ONLY'],
  });

  if (
    shadowTripReport.provenance.unknowns.some((u) => u.startsWith('PROVENANCE_GATE_FAILED'))
  ) {
    abstainReasons.push('SHADOW_PROVENANCE_GATE_FAILED');
  }

  return {
    contractVersion: DS4_RPM_REAL_DATA_REPLAY_EXECUTOR_CONTRACT_VERSION,
    bundleId: bundle.bundleId,
    inputFingerprint,
    eligibility,
    resolvedTelemetrySourceFamily: family,
    abstainReasons: [...new Set(abstainReasons)],
    shadowTripReport,
    unsupportedScientificClaims: [...DS4_RPM_REAL_DATA_UNSUPPORTED_SCIENTIFIC_CLAIMS],
  };
}
