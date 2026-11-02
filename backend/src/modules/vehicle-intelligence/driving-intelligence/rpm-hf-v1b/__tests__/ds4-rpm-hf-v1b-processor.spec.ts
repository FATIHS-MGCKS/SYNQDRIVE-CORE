import { processDs4RpmHfV1bShadowTrip } from '../ds4-rpm-hf-v1b-processor';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';

const TIGUAN_TRIP = 'c0448fea-e7c3-4658-b2fd-417c452f70d7';
const TIGUAN_VEHICLE = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const TIGUAN_ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function tiguanEnabledInput(): Ds4RpmHfV1aTripInputV1 {
  const points = Array.from({ length: 123 }, (_, i) => ({
    recordedAtIso: new Date(Date.parse('2026-10-28T11:54:00.000Z') + i * 1000).toISOString(),
    valueRpm: 1500 + i,
  }));
  return {
    contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: TIGUAN_ORG,
    vehicleId: TIGUAN_VEHICLE,
    tripId: TIGUAN_TRIP,
    providerSourceLinkId: 'link-tiguan',
    tripStartIso: '2026-10-28T11:53:00.000Z',
    tripEndIso: '2026-10-28T11:58:33.729Z',
    admission: {
      contractVersion: 'ds4-rpm-hf-admission-v1',
      iceRpmApplicability: 'APPLICABLE',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      processingStatus: 'ENABLED',
      processingAllowed: true,
      reasonCode: 'RPM_1HZ_WITH_HF_DATA',
      reasonSummary: 'prod smoke shape',
    },
    dataQuality: {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: 123,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
      earliestRecordedAtIso: points[0]!.recordedAtIso,
      latestRecordedAtIso: points[points.length - 1]!.recordedAtIso,
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
    },
    clickHouseRead: {
      status: 'SUCCESS',
      available: true,
      degradedReason: null,
      tenantScopeViolation: false,
    },
    rpmPoints: points,
    vsiActiveRpmProfileSnapshot: {
      contractVersion: 'vsi-active-rpm-profile-v1',
      activeProfile: 'RPM_1HZ',
      evaluatedTripIds: [TIGUAN_TRIP],
      qualifyingTripCount: 1,
      agreementRatio: 1,
      classificationDecisionCode: 'FAST',
      classificationDecisionSummary: 'fixture',
      tripClassifications: [{ tripId: TIGUAN_TRIP, endMs: Date.parse('2026-10-28T11:58:33.729Z'), profile: 'RPM_1HZ', intervalMedianSeconds: 1, intervalP95Seconds: 2, intervalCount: 122, rpmPointCount: 123, fractionIntervalsLe2s: 1, decisionCode: 'FAST_1_2S_BUCKET_PATTERN' }],
      profileSemanticFingerprint: 'fixture-fp',
    },
    vsiRpmCadenceTierSnapshot: null,
    tierEvidence: null,
    readOnly: true,
    productionActivationForbidden: true,
  };
}

describe('ds4-rpm-hf-v1b-processor', () => {
  it('Tiguan RPM_1HZ eligible → SUCCEEDED with temporal stats', () => {
    const out = processDs4RpmHfV1bShadowTrip({
      tripInput: tiguanEnabledInput(),
      attemptCount: 1,
      computedAt: new Date('2026-10-28T12:00:00.000Z'),
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('SUCCEEDED');
    if (out.kind !== 'SUCCEEDED') return;
    expect(out.result.productionActivationForbidden).toBe(true);
    expect(out.result.rpmValues.validPointCount).toBe(123);
    expect(out.result.readCompleteness.hfReadCompletenessLabel).toBe('COMPLETE');
    expect(out.result.vsiTripClassification.tripRpmProfile).toBe('RPM_1HZ');
    expect(out.result.shadowVariant).toBe('legacy');
    expect(out.result.engineVersion).toBe('ds4-rpm-hf-v1b-engine-v1');
  });

  it('Audi RPM_STANDARD → terminal without success persist', () => {
    const input = tiguanEnabledInput();
    input.admission = {
      ...input.admission,
      tripRpmProfile: 'RPM_STANDARD',
      processingStatus: 'DISABLED_PROFILE',
      processingAllowed: false,
      reasonCode: 'RPM_STANDARD_PROFILE',
      reasonSummary: 'audi',
    };
    const out = processDs4RpmHfV1bShadowTrip({
      tripInput: input,
      attemptCount: 1,
      computedAt: new Date(),
      existingSucceededFingerprint: null,
    });
    expect(out.kind).toBe('TERMINAL');
  });

  it('duplicate worker with same fingerprint → idempotent', () => {
    const first = processDs4RpmHfV1bShadowTrip({
      tripInput: tiguanEnabledInput(),
      attemptCount: 1,
      computedAt: new Date(),
      existingSucceededFingerprint: null,
    });
    expect(first.kind).toBe('SUCCEEDED');
    if (first.kind !== 'SUCCEEDED') return;
    const second = processDs4RpmHfV1bShadowTrip({
      tripInput: tiguanEnabledInput(),
      attemptCount: 1,
      computedAt: new Date(),
      existingSucceededFingerprint: first.fingerprint,
    });
    expect(second.kind).toBe('IDEMPOTENT');
  });

  it('changed HF RPM values allow new revision (same point count)', () => {
    const revised = tiguanEnabledInput();
    revised.rpmPoints = revised.rpmPoints.map((p, i) =>
      i === 10 ? { ...p, valueRpm: p.valueRpm + 50 } : p,
    );
    const out = processDs4RpmHfV1bShadowTrip({
      tripInput: revised,
      attemptCount: 1,
      computedAt: new Date(),
      existingSucceededFingerprint: 'old-fingerprint',
    });
    expect(out.kind).toBe('SUCCEEDED');
  });
});
