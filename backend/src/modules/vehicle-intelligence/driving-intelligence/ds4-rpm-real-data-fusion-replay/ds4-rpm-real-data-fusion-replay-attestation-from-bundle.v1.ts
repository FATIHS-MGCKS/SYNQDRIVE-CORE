import { resolveTelemetrySourceFamily } from '../../telemetry-source-family';
import { computeDs4RpmHfV1bTierAwareInputFingerprint } from '../rpm-hf-v1b/ds4-rpm-hf-v1b-input-fingerprint';
import { computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-attestation-fingerprint.v1';
import { computeDs4RpmRealDataSourceFamilyIdentityDigestV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-input-fingerprint.v1';
import type { Ds4RpmRealDataSourceAttestationBundleV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-attestation.contract.v1';
import { DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-source-attestation.contract.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from '../ds4-rpm-real-data-replay/ds4-rpm-real-data-replay.contract.v1';

function mapCadenceTier(
  tier: string | null | undefined,
): Ds4RpmRealDataSourceAttestationBundleV1['vsiCadenceTier'] {
  if (tier === 'RPM_1S' || tier === 'RPM_2S' || tier === 'RPM_3S' || tier === 'SPARSE') {
    return tier;
  }
  return tier == null ? null : 'UNKNOWN';
}

export type BuildAttestationFromOfflineBundleOptionsV1 = {
  attestationBundleId?: string;
  attestationLevel?: Ds4RpmRealDataSourceAttestationBundleV1['dimoDeviceIdentity']['attestationLevel'];
  eventLocalCadenceAssessed?: boolean;
};

/**
 * Maps an injected offline replay bundle into the PR-B3 attestation bundle shape.
 * Fixture attestation is never treated as independent field proof.
 */
export function buildDs4RpmRealDataSourceAttestationBundleFromOfflineInputV1(
  bundle: Ds4RpmRealDataOfflineInputBundleV1,
  options: BuildAttestationFromOfflineBundleOptionsV1 = {},
): Ds4RpmRealDataSourceAttestationBundleV1 {
  const family = resolveTelemetrySourceFamily(bundle.dimoVehicleRawJson);
  const v1bFp = bundle.v1bResult
    ? computeDs4RpmHfV1bTierAwareInputFingerprint(bundle.tripInput)
  : null;

  const base: Omit<Ds4RpmRealDataSourceAttestationBundleV1, 'provenanceFingerprint'> = {
    contractVersion: DS4_RPM_REAL_DATA_SOURCE_ATTESTATION_CONTRACT_VERSION,
    attestationBundleId: options.attestationBundleId ?? `attest-from-${bundle.bundleId}`,
    cohortVehicleLabel: bundle.cohortVehicleLabel,
    organizationId: bundle.organizationId,
    vehicleId: bundle.vehicleId,
    tripId: bundle.tripId,
    providerSourceLinkId: bundle.providerSourceLinkId,
    dimoDeviceIdentity: {
      dimoRawJsonMaterialDigest: computeDs4RpmRealDataSourceFamilyIdentityDigestV1(
        bundle.dimoVehicleRawJson,
      ),
      resolvedTelemetrySourceFamily: family,
      attestationLevel: options.attestationLevel ?? 'PROVEN_FROM_INJECTED_FIXTURE',
    },
    queryProvenance: {
      dimoQueryFromIso: bundle.dimoQueryFromIso,
      dimoQueryToIso: bundle.dimoQueryToIso,
      dimoBucketIntervalSeconds: 1,
      aggregationSemantics: 'DIMO_1S_AVG_PER_SIGNAL',
      speedCoBucketedWithRpm: bundle.speedCoBucketedWithRpm,
      rpmObservationSupportWidthSeconds: 'UNKNOWN',
    },
    evidenceIdentities: {
      v1aInputFingerprint: v1bFp,
      v1bRunId: bundle.v1bRunId,
      v1bInputFingerprint: bundle.v1bResult?.inputFingerprint ?? v1bFp,
      motionRunId: bundle.motionRunId,
      motionEventCount: bundle.motionPayload.events.length,
      rpmPointCount: bundle.tripInput.rpmPoints.length,
      canSpeedObservationCount: bundle.canSpeedObservations.length,
    },
    historicalTimestampTrust: 'UNKNOWN',
    iceRpmApplicability: bundle.tripInput.admission.iceRpmApplicability,
    v1bAdmissionSucceeded: bundle.v1bResult?.processingOutcome === 'SUCCEEDED',
    v1bProcessingAllowed: bundle.v1bResult?.admission.processingAllowed ?? false,
    vsiCadenceTier: mapCadenceTier(bundle.v1bResult?.tierEvidence?.tier),
    eventLocalCadenceAssessed: options.eventLocalCadenceAssessed ?? true,
  };

  const provenanceFingerprint = computeDs4RpmRealDataSourceAttestationProvenanceFingerprintV1(base);
  return { ...base, provenanceFingerprint };
}
