import { routeDs4RpmHfV1bFromV1aAdmission } from '../ds4-rpm-hf-v1b-admission-routing';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';

function baseTripInput(
  overrides: {
    admission?: Partial<Ds4RpmHfV1aTripInputV1['admission']>;
    dataQuality?: Partial<Ds4RpmHfV1aTripInputV1['dataQuality']>;
    clickHouseRead?: Partial<Ds4RpmHfV1aTripInputV1['clickHouseRead']>;
  } & Omit<Partial<Ds4RpmHfV1aTripInputV1>, 'admission' | 'dataQuality' | 'clickHouseRead'> = {},
): Ds4RpmHfV1aTripInputV1 {
  const {
    admission: admissionOverride,
    dataQuality: dataQualityOverride,
    clickHouseRead: clickHouseReadOverride,
    ...rest
  } = overrides;
  const baseAdmission: Ds4RpmHfV1aTripInputV1['admission'] = {
    contractVersion: 'ds4-rpm-hf-admission-v1',
    iceRpmApplicability: 'APPLICABLE',
    tripRpmProfile: 'RPM_1HZ',
    vehicleActiveRpmProfile: 'RPM_1HZ',
    processingStatus: 'ENABLED',
    processingAllowed: true,
    reasonCode: 'RPM_1HZ_WITH_HF_DATA',
    reasonSummary: 'ok',
    ...admissionOverride,
  };
  return {
    contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    providerSourceLinkId: 'link-1',
    tripStartIso: '2026-10-28T11:53:00.000Z',
    tripEndIso: '2026-10-28T11:58:33.729Z',
    admission: baseAdmission,
    dataQuality: {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: 123,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
      earliestRecordedAtIso: '2026-10-28T11:54:00.000Z',
      latestRecordedAtIso: '2026-10-28T11:58:33.000Z',
      observedIntervals: {
        intervalCount: 122,
        intervalMedianSeconds: 1,
        intervalP95Seconds: 2,
        minIntervalSeconds: 1,
        maxIntervalSeconds: 2,
      },
      identifiedGaps: [],
      completenessLabel: 'COMPLETE',
      totalMatchingCount: 123,
      returnedPointCount: 123,
      readLimit: 12000,
      readOffset: 0,
      bucketSemanticsNote: 'DIMO_1S_AVG_BUCKETS_NOT_OEM_CAN_HZ',
      gapInterpretationPolicy: 'MISSING_POINTS_NOT_ENGINE_STOP',
      ...dataQualityOverride,
    },
    clickHouseRead: {
      status: 'SUCCESS',
      available: true,
      degradedReason: null,
      tenantScopeViolation: false,
      ...clickHouseReadOverride,
    },
    rpmPoints: [],
    vsiActiveRpmProfileSnapshot: null,
    vsiRpmCadenceTierSnapshot: null,
    tierEvidence: null,
    readOnly: true,
    productionActivationForbidden: true,
    ...rest,
  };
}

describe('ds4-rpm-hf-v1b-admission-routing', () => {
  const routingOpts = (nowIso: string) => ({
    maxDeferAttempts: 6,
    nowMs: Date.parse(nowIso),
    postTripReadinessWindowMs: 72 * 60 * 60_000,
  });

  it('RPM_1HZ + complete HF → SUCCEEDED persist path', () => {
    const r = routeDs4RpmHfV1bFromV1aAdmission(baseTripInput(), 1, routingOpts('2026-10-28T12:00:00.000Z'));
    expect(r.outcome).toBe('SUCCEEDED');
    expect(r.shouldPersistAnalysis).toBe(true);
  });

  it('Audi RPM_STANDARD → terminal ineligible', () => {
    const r = routeDs4RpmHfV1bFromV1aAdmission(
      baseTripInput({
        admission: {
          tripRpmProfile: 'RPM_STANDARD',
          processingStatus: 'DISABLED_PROFILE',
          processingAllowed: false,
          reasonCode: 'RPM_STANDARD_PROFILE',
          reasonSummary: 'blocked',
        },
      }),
      1,
      routingOpts('2026-10-28T12:00:00.000Z'),
    );
    expect(r.outcome).toBe('TERMINAL_INELIGIBLE');
  });

  it('missing HF → defer (not permanent immediately)', () => {
    const r = routeDs4RpmHfV1bFromV1aAdmission(
      baseTripInput({
        admission: {
          processingStatus: 'DISABLED_NO_HF_DATA',
          processingAllowed: false,
          reasonCode: 'HF_RPM_DATA_MISSING',
          reasonSummary: 'wait',
        },
      }),
      1,
      routingOpts('2026-10-28T12:00:00.000Z'),
    );
    expect(r.outcome).toBe('DEFER_RETRY');
    expect(r.deferReasonCode).toBe('HF_RPM_DATA_MISSING');
  });

  it('VSI unclassified → defer until attempt budget exhausted', () => {
    const late = routeDs4RpmHfV1bFromV1aAdmission(
      baseTripInput({
        admission: {
          tripRpmProfile: 'UNCLASSIFIED',
          processingStatus: 'DISABLED_TRIP_NOT_CLASSIFIED',
          processingAllowed: false,
          reasonCode: 'TRIP_RPM_PROFILE_UNCLASSIFIED',
          reasonSummary: 'wait vsi',
        },
      }),
      6,
      routingOpts('2026-10-28T12:00:00.000Z'),
    );
    expect(late.outcome).toBe('TERMINAL_INELIGIBLE');
    expect(late.rejectionReasonCode).toBe('TRIP_RPM_PROFILE_UNCLASSIFIED_DEFER_ATTEMPT_BUDGET_EXCEEDED');
  });

  it('readiness window exhausted is distinct from defer attempt budget', () => {
    const r = routeDs4RpmHfV1bFromV1aAdmission(
      baseTripInput({
        admission: {
          tripRpmProfile: 'UNCLASSIFIED',
          processingStatus: 'DISABLED_TRIP_NOT_CLASSIFIED',
          processingAllowed: false,
          reasonCode: 'TRIP_RPM_PROFILE_UNCLASSIFIED',
          reasonSummary: 'wait vsi',
        },
      }),
      1,
      routingOpts('2026-11-01T12:00:00.000Z'),
    );
    expect(r.outcome).toBe('TERMINAL_INELIGIBLE');
    expect(r.rejectionReasonCode).toBe('TRIP_RPM_PROFILE_UNCLASSIFIED_READINESS_WINDOW_EXHAUSTED');
  });

  it('tenant scope violation → terminal failed closed', () => {
    const r = routeDs4RpmHfV1bFromV1aAdmission(
      baseTripInput({
        clickHouseRead: {
          tenantScopeViolation: true,
          status: 'TENANT_SCOPE_VIOLATION',
          available: false,
          degradedReason: null,
        },
        admission: {
          processingStatus: 'DISABLED_TENANT_SCOPE',
          processingAllowed: false,
          reasonCode: 'TENANT_SCOPE_VIOLATION',
          reasonSummary: 'bad',
        },
      }),
      1,
      routingOpts('2026-10-28T12:00:00.000Z'),
    );
    expect(r.outcome).toBe('TERMINAL_FAILED');
  });
});
