import type { VsiActiveRpmProfileLabel, VsiIceRpmApplicability } from '../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import type { Ds4RpmHfV1aAdmissionV1, Ds4RpmHfV1aProcessingStatus } from './ds4-rpm-hf-v1a.contract';

export type Ds4RpmHfV1aAdmissionInput = {
  iceRpmApplicability: VsiIceRpmApplicability;
  tripId: string;
  tripRpmProfile: VsiActiveRpmProfileLabel | 'UNCLASSIFIED';
  vehicleActiveRpmProfile: VsiActiveRpmProfileLabel | null;
  hfDataPresent: boolean;
  chReadAvailable: boolean;
  tenantScopeViolation: boolean;
  /** True when all matching CH rows for the trip window are returned in this read (offset 0, full count). */
  hfReadComplete: boolean;
};

export function resolveDs4RpmHfV1aAdmission(
  input: Ds4RpmHfV1aAdmissionInput,
): Ds4RpmHfV1aAdmissionV1 {
  if (input.iceRpmApplicability === 'NOT_APPLICABLE') {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_NOT_APPLICABLE',
      processingAllowed: false,
      reasonCode: 'ICE_RPM_NOT_APPLICABLE',
      reasonSummary: 'Vehicle fuel type excludes combustion engine RPM.',
    });
  }

  if (input.iceRpmApplicability === 'UNKNOWN') {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_PROFILE',
      processingAllowed: false,
      reasonCode: 'ICE_RPM_APPLICABILITY_UNKNOWN',
      reasonSummary: 'ICE RPM applicability unknown — fail closed.',
    });
  }

  if (input.tenantScopeViolation) {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_TENANT_SCOPE',
      processingAllowed: false,
      reasonCode: 'TENANT_SCOPE_VIOLATION',
      reasonSummary: 'ClickHouse rows violated org/vehicle/trip scope.',
    });
  }

  if (!input.hfReadComplete && input.tripRpmProfile === 'RPM_1HZ' && input.hfDataPresent) {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_INCOMPLETE_HF_READ',
      processingAllowed: false,
      reasonCode: 'HF_RPM_READ_INCOMPLETE',
      reasonSummary:
        'More RPM HF points exist than returned — trip not fully readable in a single V1A page.',
    });
  }

  if (!input.chReadAvailable) {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_CH_UNAVAILABLE',
      processingAllowed: false,
      reasonCode: 'CLICKHOUSE_UNAVAILABLE',
      reasonSummary: 'HF ClickHouse read unavailable or failed.',
    });
  }

  if (input.tripRpmProfile === 'UNCLASSIFIED') {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_TRIP_NOT_CLASSIFIED',
      processingAllowed: false,
      reasonCode: 'TRIP_RPM_PROFILE_UNCLASSIFIED',
      reasonSummary:
        'Trip lacks VSI per-trip RPM classification — vehicle active RPM_1HZ is not applied retroactively.',
    });
  }

  if (input.tripRpmProfile === 'RPM_STANDARD') {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_PROFILE',
      processingAllowed: false,
      reasonCode: 'RPM_STANDARD_PROFILE',
      reasonSummary: 'VSI trip profile RPM_STANDARD — regular RPM HF processing disabled.',
    });
  }

  if (input.tripRpmProfile === 'UNKNOWN') {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_PROFILE',
      processingAllowed: false,
      reasonCode: 'RPM_UNKNOWN_PROFILE',
      reasonSummary: 'VSI trip profile UNKNOWN — processing disabled.',
    });
  }

  // RPM_1HZ — allowed only with HF data present
  if (!input.hfDataPresent) {
    return buildAdmission(input, {
      processingStatus: 'DISABLED_NO_HF_DATA',
      processingAllowed: false,
      reasonCode: 'HF_RPM_DATA_MISSING',
      reasonSummary: 'RPM_1HZ admitted in principle but no HF RPM points for trip.',
    });
  }

  return buildAdmission(input, {
    processingStatus: 'ENABLED',
    processingAllowed: true,
    reasonCode: 'RPM_1HZ_WITH_HF_DATA',
    reasonSummary: 'VSI trip profile RPM_1HZ and complete HF RPM points available.',
  });
}

/** Skip ClickHouse when admission outcome is already determined without HF data. */
export function shouldSkipClickHouseRpmReadForAdmission(input: {
  iceRpmApplicability: VsiIceRpmApplicability;
  tripRpmProfile: VsiActiveRpmProfileLabel | 'UNCLASSIFIED';
}): boolean {
  if (input.iceRpmApplicability !== 'APPLICABLE') {
    return true;
  }
  return input.tripRpmProfile !== 'RPM_1HZ';
}

export function buildAdmissionForTripIdentityFailure(input: {
  iceRpmApplicability: VsiIceRpmApplicability;
  tripRpmProfile: VsiActiveRpmProfileLabel | 'UNCLASSIFIED';
  vehicleActiveRpmProfile: VsiActiveRpmProfileLabel | null;
  reasonCode: string;
  reasonSummary: string;
}): Ds4RpmHfV1aAdmissionV1 {
  return {
    contractVersion: 'ds4-rpm-hf-admission-v1',
    iceRpmApplicability: input.iceRpmApplicability,
    tripRpmProfile: input.tripRpmProfile,
    vehicleActiveRpmProfile: input.vehicleActiveRpmProfile,
    processingStatus: 'DISABLED_TRIP_IDENTITY',
    processingAllowed: false,
    reasonCode: input.reasonCode,
    reasonSummary: input.reasonSummary,
  };
}

function buildAdmission(
  input: Ds4RpmHfV1aAdmissionInput,
  decision: {
    processingStatus: Ds4RpmHfV1aProcessingStatus;
    processingAllowed: boolean;
    reasonCode: string;
    reasonSummary: string;
  },
): Ds4RpmHfV1aAdmissionV1 {
  return {
    contractVersion: 'ds4-rpm-hf-admission-v1',
    iceRpmApplicability: input.iceRpmApplicability,
    tripRpmProfile: input.tripRpmProfile,
    vehicleActiveRpmProfile: input.vehicleActiveRpmProfile,
    processingStatus: decision.processingStatus,
    processingAllowed: decision.processingAllowed,
    reasonCode: decision.reasonCode,
    reasonSummary: decision.reasonSummary,
  };
}

/**
 * Resolve per-trip RPM profile from VSI rolling classifications only.
 * Never promotes vehicle-level RPM_1HZ to trips outside the classification list.
 */
export function resolveTripRpmProfileFromVsi(input: {
  tripId: string;
  tripClassifications: readonly { tripId: string; profile: VsiActiveRpmProfileLabel }[];
}): VsiActiveRpmProfileLabel | 'UNCLASSIFIED' {
  const row = input.tripClassifications.find((c) => c.tripId === input.tripId);
  if (!row) {
    return 'UNCLASSIFIED';
  }
  return row.profile;
}
