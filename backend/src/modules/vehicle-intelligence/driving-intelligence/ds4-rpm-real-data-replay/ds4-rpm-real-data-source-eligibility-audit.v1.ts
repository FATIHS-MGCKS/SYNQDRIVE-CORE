import { hasUncertainHistoricalObdRecordTime } from '../../telemetry-source-family';
import type {
  Ds4RpmRealDataEligibilityVerdict,
  Ds4RpmRealDataSourceEligibilityDimensionV1,
  Ds4RpmRealDataSourceEligibilityInputV1,
  Ds4RpmRealDataSourceEligibilityResultV1,
} from './ds4-rpm-real-data-source-eligibility.contract.v1';
import { DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION } from './ds4-rpm-real-data-source-eligibility.contract.v1';

function dim(
  dimension: Ds4RpmRealDataSourceEligibilityDimensionV1['dimension'],
  verdict: Ds4RpmRealDataEligibilityVerdict,
  reasonCode: string,
): Ds4RpmRealDataSourceEligibilityDimensionV1 {
  return { dimension, verdict, reasonCode };
}

function worstVerdict(
  dimensions: readonly Ds4RpmRealDataSourceEligibilityDimensionV1[],
): Ds4RpmRealDataEligibilityVerdict {
  const order: Ds4RpmRealDataEligibilityVerdict[] = [
    'BLOCKED',
    'NOT_APPLICABLE',
    'UNPROVEN',
    'ELIGIBLE',
  ];
  for (const v of order) {
    if (dimensions.some((d) => d.verdict === v)) return v;
  }
  return 'UNPROVEN';
}

/**
 * Pure eligibility audit — no network, DB, or vehicle-model inference.
 * ELIGIBLE requires explicit owner-authorized read + proven bindings (PR-B1 does not collect these).
 */
export function auditDs4RpmRealDataSourceEligibilityV1(
  input: Ds4RpmRealDataSourceEligibilityInputV1,
): Ds4RpmRealDataSourceEligibilityResultV1 {
  const dimensions: Ds4RpmRealDataSourceEligibilityDimensionV1[] = [];
  const abstainReasons: string[] = [];

  if (!input.authorizedRealDataReadDeclared) {
    abstainReasons.push('OWNER_AUTHORIZED_REAL_DATA_READ_NOT_DECLARED');
  }

  const bindingOk =
    input.organizationId != null &&
    input.vehicleId != null &&
    input.tripId != null &&
    input.providerSourceLinkId != null;
  dimensions.push(
    dim(
      'TENANT_VEHICLE_TRIP_BINDING',
      bindingOk ? 'UNPROVEN' : 'UNPROVEN',
      bindingOk ? 'BINDING_FIELDS_PRESENT_BUT_UNVERIFIED' : 'BINDING_FIELDS_INCOMPLETE',
    ),
  );

  const family = input.telemetrySourceFamily;
  if (family != null && hasUncertainHistoricalObdRecordTime(family)) {
    dimensions.push(
      dim(
        'HISTORICAL_SOURCE_TIMESTAMP_AUTHORITY',
        'BLOCKED',
        'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED',
      ),
    );
  } else if (input.sourceFamilyAttestation !== 'PROVEN_FROM_DIMO_IDENTITY') {
    dimensions.push(
      dim(
        'SOURCE_FAMILY_ATTESTATION',
        'UNPROVEN',
        'SOURCE_FAMILY_NOT_PROVEN_FROM_DIMO_IDENTITY',
      ),
    );
    dimensions.push(
      dim(
        'HISTORICAL_SOURCE_TIMESTAMP_AUTHORITY',
        'UNPROVEN',
        'SOURCE_TIMESTAMP_PHASE_UNKNOWN_WITHOUT_PROVEN_FAMILY',
      ),
    );
  } else if (input.sourceTimestampPhase !== 'UNKNOWN') {
    dimensions.push(
      dim(
        'HISTORICAL_SOURCE_TIMESTAMP_AUTHORITY',
        'UNPROVEN',
        'UNEXPECTED_TIMESTAMP_PHASE_CLAIM',
      ),
    );
  } else {
    dimensions.push(
      dim(
        'HISTORICAL_SOURCE_TIMESTAMP_AUTHORITY',
        'UNPROVEN',
        'PHASE_UNKNOWN_NO_CROSS_DOMAIN_CALIBRATION',
      ),
    );
  }

  if (input.iceRpmApplicability === 'NOT_APPLICABLE') {
    dimensions.push(
      dim('ICE_RPM_AVAILABILITY', 'NOT_APPLICABLE', 'ICE_RPM_NOT_APPLICABLE'),
    );
  } else if (input.iceRpmApplicability === 'UNKNOWN') {
    dimensions.push(dim('ICE_RPM_AVAILABILITY', 'UNPROVEN', 'ICE_RPM_APPLICABILITY_UNKNOWN'));
  } else {
    dimensions.push(
      dim('ICE_RPM_AVAILABILITY', 'UNPROVEN', 'COMBUSTION_RPM_NOT_ATTESTED_FOR_COHORT'),
    );
  }

  if (input.v1bAdmissionSucceeded === true && input.v1bProcessingAllowed === true) {
    dimensions.push(
      dim('V1B_ADMITTED_EVIDENCE', 'UNPROVEN', 'V1B_POSITIVE_BUT_NOT_INDEPENDENTLY_ATTESTED'),
    );
  } else {
    dimensions.push(
      dim(
        'V1B_ADMITTED_EVIDENCE',
        'UNPROVEN',
        input.v1bAdmissionSucceeded === false
          ? 'V1B_ADMISSION_NOT_SUCCEEDED'
          : 'V1B_EVIDENCE_NOT_ATTESTED',
      ),
    );
  }

  if (
    input.vsiCadenceTier === 'RPM_1S' ||
    input.vsiCadenceTier === 'RPM_2S' ||
    input.vsiCadenceTier === 'RPM_3S'
  ) {
    dimensions.push(
      dim(
        'VSI_EFFECTIVE_RESOLUTION',
        input.vsiTierAnalyticsReady === true ? 'UNPROVEN' : 'UNPROVEN',
        input.vsiTierAnalyticsReady === true
          ? 'VSI_TIER_LABELED_BUT_COHORT_UNVERIFIED'
          : 'VSI_TIER_ANALYTICS_NOT_READY',
      ),
    );
  } else {
    dimensions.push(
      dim(
        'VSI_EFFECTIVE_RESOLUTION',
        'UNPROVEN',
        input.vsiCadenceTier == null ? 'VSI_TIER_MISSING' : 'VSI_TIER_NOT_DEFENSIBLE',
      ),
    );
  }

  dimensions.push(
    dim(
      'LOCAL_EVENT_CADENCE',
      'UNPROVEN',
      'EVENT_LEVEL_CADENCE_NOT_MEASURED_IN_PR_B1',
    ),
  );
  dimensions.push(
    dim(
      'MOTION_EVENT_TEMPORAL_QUALITY',
      'UNPROVEN',
      input.motionEventCountInTrip != null && input.motionEventCountInTrip > 0
        ? 'MOTION_EVENTS_PRESENT_BUT_QUALITY_UNSCORED'
        : 'MOTION_EVENT_EVIDENCE_NOT_ATTESTED',
    ),
  );

  if (input.speedCoBucketedWithRpm === true && input.dimoBucketIntervalSeconds === 1) {
    dimensions.push(
      dim(
        'CAN_SPEED_CO_BUCKETING',
        'UNPROVEN',
        'CO_BUCKETING_ASSUMED_FROM_HF_QUERY_SHAPE_NOT_TRIP_VERIFIED',
      ),
    );
  } else {
    dimensions.push(
      dim(
        'CAN_SPEED_CO_BUCKETING',
        'UNPROVEN',
        'SPEED_RPM_CO_BUCKETING_NOT_ATTESTED',
      ),
    );
  }

  let overall = worstVerdict(dimensions);
  if (!input.authorizedRealDataReadDeclared) {
    overall = overall === 'ELIGIBLE' ? 'UNPROVEN' : overall;
    if (overall === 'UNPROVEN' && input.iceRpmApplicability !== 'NOT_APPLICABLE') {
      abstainReasons.push('REAL_DATA_READ_GATE');
    }
  }

  if (overall === 'ELIGIBLE') {
    abstainReasons.push('ELIGIBLE_CLAIM_REQUIRES_INDEPENDENT_ATTESTATION');
    overall = 'UNPROVEN';
  }

  return {
    contractVersion: DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION,
    cohortVehicleLabel: input.cohortVehicleLabel,
    overallVerdict: overall,
    dimensions,
    abstainReasons: [...new Set(abstainReasons)],
  };
}
