import {
  auditDs4RpmRealDataSourceEligibilityV1,
} from '../ds4-rpm-real-data-source-eligibility-audit.v1';
import type { Ds4RpmRealDataSourceEligibilityInputV1 } from '../ds4-rpm-real-data-source-eligibility.contract.v1';
import { DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION } from '../ds4-rpm-real-data-source-eligibility.contract.v1';

function baseInput(
  overrides: Partial<Ds4RpmRealDataSourceEligibilityInputV1> = {},
): Ds4RpmRealDataSourceEligibilityInputV1 {
  return {
    contractVersion: DS4_RPM_REAL_DATA_SOURCE_ELIGIBILITY_CONTRACT_VERSION,
    cohortVehicleLabel: 'AUDI_A4',
    organizationId: null,
    vehicleId: null,
    tripId: null,
    providerSourceLinkId: null,
    telemetrySourceFamily: null,
    sourceFamilyAttestation: 'NOT_COLLECTED',
    iceRpmApplicability: 'UNKNOWN',
    v1bProcessingAllowed: null,
    v1bAdmissionSucceeded: null,
    vsiCadenceTier: null,
    vsiTierAnalyticsReady: null,
    sourceTimestampPhase: 'UNKNOWN',
    rpmObservationSupportWidthSeconds: 'UNKNOWN',
    dimoQueryFromIso: null,
    dimoQueryToIso: null,
    dimoBucketIntervalSeconds: 1,
    speedCoBucketedWithRpm: null,
    motionEventCountInTrip: null,
    authorizedRealDataReadDeclared: false,
    ...overrides,
  };
}

describe('ds4-rpm-real-data-source-eligibility-audit v1', () => {
  it('blocks R1 historical OBD point-time correlation', () => {
    const result = auditDs4RpmRealDataSourceEligibilityV1(
      baseInput({
        telemetrySourceFamily: 'RUPTELA_R1',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        iceRpmApplicability: 'APPLICABLE',
      }),
    );
    expect(result.overallVerdict).toBe('BLOCKED');
    expect(
      result.dimensions.some(
        (d) =>
          d.dimension === 'HISTORICAL_SOURCE_TIMESTAMP_AUTHORITY' &&
          d.reasonCode === 'R1_HISTORICAL_OBD_POINT_TIME_CORRELATION_PROHIBITED',
      ),
    ).toBe(true);
  });

  it('classifies Tesla Model 3 ICE RPM as NOT_APPLICABLE without claiming ELIGIBLE', () => {
    const result = auditDs4RpmRealDataSourceEligibilityV1(
      baseInput({
        cohortVehicleLabel: 'TESLA_MODEL_3',
        telemetrySourceFamily: 'API_SYNTHETIC',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        iceRpmApplicability: 'NOT_APPLICABLE',
      }),
    );
    expect(result.overallVerdict).toBe('NOT_APPLICABLE');
  });

  it('never marks reference cohorts ELIGIBLE without owner-authorized attestation bundle', () => {
    for (const cohort of [
      'AUDI_A4',
      'VW_ARTEON',
      'VW_TIGUAN',
      'TESLA_MODEL_3',
    ] as const) {
      const result = auditDs4RpmRealDataSourceEligibilityV1(
        baseInput({
          cohortVehicleLabel: cohort,
          iceRpmApplicability:
            cohort === 'TESLA_MODEL_3' ? 'NOT_APPLICABLE' : 'APPLICABLE',
          telemetrySourceFamily: 'API_SYNTHETIC',
          sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
          v1bAdmissionSucceeded: true,
          v1bProcessingAllowed: true,
          vsiCadenceTier: 'RPM_1S',
          vsiTierAnalyticsReady: true,
          organizationId: 'org',
          vehicleId: 'veh',
          tripId: 'trip',
          providerSourceLinkId: 'link',
          speedCoBucketedWithRpm: true,
          motionEventCountInTrip: 3,
        }),
      );
      expect(result.overallVerdict).not.toBe('ELIGIBLE');
      expect(result.abstainReasons).toContain('OWNER_AUTHORIZED_REAL_DATA_READ_NOT_DECLARED');
    }
  });

  it('abstains on authorized-read flag alone without inventing ELIGIBLE', () => {
    const result = auditDs4RpmRealDataSourceEligibilityV1(
      baseInput({
        authorizedRealDataReadDeclared: true,
        telemetrySourceFamily: 'API_SYNTHETIC',
        sourceFamilyAttestation: 'PROVEN_FROM_DIMO_IDENTITY',
        iceRpmApplicability: 'APPLICABLE',
        v1bAdmissionSucceeded: true,
        v1bProcessingAllowed: true,
        vsiCadenceTier: 'RPM_2S',
        vsiTierAnalyticsReady: true,
      }),
    );
    expect(result.overallVerdict).toBe('UNPROVEN');
  });
});
