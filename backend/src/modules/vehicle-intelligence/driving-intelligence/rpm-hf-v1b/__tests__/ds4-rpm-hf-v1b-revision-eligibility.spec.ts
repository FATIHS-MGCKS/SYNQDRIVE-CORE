import { isTripInputEligibleForAutomaticRevision } from '../ds4-rpm-hf-v1b-revision-eligibility';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';

function baseInput(overrides: Partial<Ds4RpmHfV1aTripInputV1['admission']> = {}): Ds4RpmHfV1aTripInputV1 {
  return {
    contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: 'org',
    vehicleId: 'veh',
    tripId: 'trip',
    providerSourceLinkId: 'link',
    tripStartIso: '2026-01-01T10:00:00.000Z',
    tripEndIso: '2026-01-01T10:05:00.000Z',
    admission: {
      contractVersion: 'ds4-rpm-hf-admission-v1',
      iceRpmApplicability: 'APPLICABLE',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      processingStatus: 'ENABLED',
      processingAllowed: true,
      reasonCode: 'RPM_1HZ_WITH_HF_DATA',
      reasonSummary: 'ok',
      ...overrides,
    },
    dataQuality: {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: 1,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
      earliestRecordedAtIso: '2026-01-01T10:00:01.000Z',
      latestRecordedAtIso: '2026-01-01T10:00:02.000Z',
      observedIntervals: {
        intervalCount: 0,
        intervalMedianSeconds: null,
        intervalP95Seconds: null,
        minIntervalSeconds: null,
        maxIntervalSeconds: null,
      },
      identifiedGaps: [],
      completenessLabel: 'COMPLETE',
      totalMatchingCount: 1,
      returnedPointCount: 1,
      readLimit: 12000,
      readOffset: 0,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP',
    },
    clickHouseRead: {
      status: 'SUCCESS',
      available: true,
      degradedReason: null,
      tenantScopeViolation: false,
    },
    rpmPoints: [{ recordedAtIso: '2026-01-01T10:00:01.000Z', valueRpm: 900 }],
    vsiActiveRpmProfileSnapshot: null,
    vsiRpmCadenceTierSnapshot: null,
    tierEvidence: null,
    readOnly: true,
    productionActivationForbidden: true,
  };
}

describe('ds4-rpm-hf-v1b-revision-eligibility', () => {
  it('allows automatic revision only for authoritative RPM_1HZ enabled inputs', () => {
    expect(isTripInputEligibleForAutomaticRevision(baseInput())).toBe(true);
  });

  it('blocks reopen when trip is unclassified or HF not ready', () => {
    expect(
      isTripInputEligibleForAutomaticRevision(
        baseInput({
          tripRpmProfile: 'UNCLASSIFIED',
          processingStatus: 'DISABLED_TRIP_NOT_CLASSIFIED',
          processingAllowed: false,
        }),
      ),
    ).toBe(false);
    expect(
      isTripInputEligibleForAutomaticRevision(
        baseInput({
          processingStatus: 'DISABLED_CH_UNAVAILABLE',
          processingAllowed: false,
        }),
      ),
    ).toBe(false);
  });
});
