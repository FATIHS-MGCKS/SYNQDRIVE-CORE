import type { Ds4RpmRealDataSourceEligibilityInputV1 } from './ds4-rpm-real-data-source-eligibility.contract.v1';
import { DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION } from './ds4-rpm-real-data-source-eligibility.contract.v1';
import type { Ds4RpmRealDataOfflineInputBundleV1 } from './ds4-rpm-real-data-replay.contract.v1';
import type { TelemetrySourceFamily } from '../../telemetry-source-family';

export function buildDs4RpmRealDataEligibilityInputFromOfflineBundleV1(input: {
  bundle: Ds4RpmRealDataOfflineInputBundleV1;
  telemetrySourceFamily: TelemetrySourceFamily;
  sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY' | 'NOT_COLLECTED';
}): Ds4RpmRealDataSourceEligibilityInputV1 {
  const v1b = input.bundle.v1bResult;
  const tierExposure = v1b?.admission.qualityExposure;
  const tier =
    (tierExposure?.cadenceTier as Ds4RpmRealDataSourceEligibilityInputV1['vsiCadenceTier']) ??
    (v1b?.tierEvidence?.tier as Ds4RpmRealDataSourceEligibilityInputV1['vsiCadenceTier']) ??
    null;
  const ice =
    (input.bundle.tripInput.admission.iceRpmApplicability as
      | 'APPLICABLE'
      | 'NOT_APPLICABLE'
      | 'UNKNOWN') ??
    (v1b?.admission.iceRpmApplicability as 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN') ??
    'UNKNOWN';

  return {
    contractVersion: DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION,
    cohortVehicleLabel: input.bundle.cohortVehicleLabel,
    organizationId: input.bundle.organizationId,
    vehicleId: input.bundle.vehicleId,
    tripId: input.bundle.tripId,
    providerSourceLinkId: input.bundle.providerSourceLinkId,
    telemetrySourceFamily: input.telemetrySourceFamily,
    sourceFamilyAttestation: input.sourceFamilyAttestation,
    iceRpmApplicability: ice,
    v1bProcessingAllowed: v1b?.admission.processingAllowed ?? null,
    v1bAdmissionSucceeded: v1b?.processingOutcome === 'SUCCEEDED' ? true : v1b ? false : null,
    vsiCadenceTier: tier,
    vsiTierAnalyticsReady: tierExposure?.tierAnalyticsReady ?? null,
    sourceTimestampPhase: 'UNKNOWN',
    rpmObservationSupportWidthSeconds: 'UNKNOWN',
    dimoQueryFromIso: input.bundle.dimoQueryFromIso,
    dimoQueryToIso: input.bundle.dimoQueryToIso,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: input.bundle.speedCoBucketedWithRpm,
    motionEventCountInTrip: input.bundle.motionPayload.events.length,
    authorizedRealDataReadDeclared: false,
  };
}