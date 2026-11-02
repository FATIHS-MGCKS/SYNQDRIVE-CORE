import type { VsiRpmCadenceTierTripClassificationV1 } from '../../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import type { VsiRpmCadenceTierResolutionV1 } from '../../../vehicle-signal-intelligence/vsi-profile-cadence.types';
import type { Ds4RpmHfV1aTripInputV1 } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { DS4_RPM_HF_V1A_CONTRACT_VERSION } from '../../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';
import { VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION } from '../../../vehicle-signal-intelligence/vsi-profile-cadence.types';

export const TIER_TEST_TRIP = 'trip-tier-test';
export const TIER_TEST_VEHICLE = 'veh-tier';
export const TIER_TEST_ORG = 'org-tier';
export const TIER_TEST_LINK = 'link-tier-a';

export function buildTierTripClassification(
  overrides: Partial<VsiRpmCadenceTierTripClassificationV1> & { tier: VsiRpmCadenceTierTripClassificationV1['tier'] },
): VsiRpmCadenceTierTripClassificationV1 {
  const tripEndMs = Date.parse('2026-01-01T10:05:00.000Z');
  return {
    tripId: TIER_TEST_TRIP,
    endMs: tripEndMs,
    tier: overrides.tier,
    cadenceConfidence: overrides.cadenceConfidence ?? 'HIGH',
    tripCoverageBand: overrides.tripCoverageBand ?? 'FULL_SPAN',
    analysisReadiness: overrides.analysisReadiness ?? 'TIER_ANALYTICS_OK',
    decisionCode: overrides.decisionCode ?? 'TIER_ASSIGNED',
    intervalEvidenceUsed: overrides.intervalEvidenceUsed ?? {
      rpmPointCount: 50,
      activeIntervalCount: 40,
      tripDurationSeconds: 300,
    },
    p50ActiveSeconds: overrides.p50ActiveSeconds ?? 1,
    p75ActiveSeconds: overrides.p75ActiveSeconds ?? 1,
    p90ActiveSeconds: overrides.p90ActiveSeconds ?? 2,
    activeSpanRatio: overrides.activeSpanRatio ?? 0.9,
    activeDensityVsTier: overrides.activeDensityVsTier ?? 0.95,
    tierPuritySharePlusOne: overrides.tierPuritySharePlusOne ?? 0.98,
    longestSequenceIntervals: overrides.longestSequenceIntervals ?? 20,
  };
}

export function buildTierSnapshot(
  row: VsiRpmCadenceTierTripClassificationV1,
): VsiRpmCadenceTierResolutionV1 {
  return {
    contractVersion: VSI_RPM_CADENCE_TIER_RESOLUTION_CONTRACT_VERSION,
    evaluatedTripIds: [row.tripId],
    tripClassifications: [row],
    rollingVehicleTierSummary: {
      tier: row.tier === 'UNKNOWN' || row.tier === 'SPARSE' ? null : row.tier,
      agreementRatio: 1,
      classificationDecisionCode: 'QUORUM',
      classificationDecisionSummary: 'fixture rolling — must not drive admission',
      sufficientEvidence: true,
    },
    provenance: ['fixture'],
    evidenceObservedAt: '2026-01-01T10:05:01.000Z',
  };
}

export function buildRpmPointsEverySeconds(
  startIso: string,
  count: number,
  stepSec: number,
): Array<{ recordedAtIso: string; valueRpm: number }> {
  const startMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => ({
    recordedAtIso: new Date(startMs + i * stepSec * 1000).toISOString(),
    valueRpm: 1500 + i,
  }));
}

export function buildTierTripInput(input: {
  rpmPoints: Array<{ recordedAtIso: string; valueRpm: number }>;
  tierRow: VsiRpmCadenceTierTripClassificationV1 | null;
  tierSnapshot?: VsiRpmCadenceTierResolutionV1 | null;
  providerSourceLinkId?: string;
  tripId?: string;
}): Ds4RpmHfV1aTripInputV1 {
  const tripId = input.tripId ?? TIER_TEST_TRIP;
  const snapshot =
    input.tierSnapshot ??
    (input.tierRow ? buildTierSnapshot({ ...input.tierRow, tripId }) : null);
  const tripEndIso = '2026-01-01T10:05:00.000Z';
  const tierEvidence =
    input.tierRow && snapshot
      ? {
          contractVersion: 'ds4-rpm-hf-tier-evidence-v1' as const,
          status: 'AVAILABLE' as const,
          tripId,
          providerSourceLinkId: input.providerSourceLinkId ?? TIER_TEST_LINK,
          tripClassification: { ...input.tierRow, tripId },
          blockEvidenceObservedAt: snapshot.evidenceObservedAt,
        }
      : snapshot
        ? {
            contractVersion: 'ds4-rpm-hf-tier-evidence-v1' as const,
            status: 'MISSING_ROW' as const,
            tripId,
            providerSourceLinkId: input.providerSourceLinkId ?? TIER_TEST_LINK,
            tripClassification: null,
            blockEvidenceObservedAt: snapshot.evidenceObservedAt,
          }
        : {
            contractVersion: 'ds4-rpm-hf-tier-evidence-v1' as const,
            status: 'MISSING_ROW' as const,
            tripId,
            providerSourceLinkId: input.providerSourceLinkId ?? TIER_TEST_LINK,
            tripClassification: null,
            blockEvidenceObservedAt: null,
          };

  return {
    contractVersion: DS4_RPM_HF_V1A_CONTRACT_VERSION,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    providerSourceLinkId: input.providerSourceLinkId ?? TIER_TEST_LINK,
    tripStartIso: '2026-01-01T10:00:00.000Z',
    tripEndIso,
    admission: {
      contractVersion: 'ds4-rpm-hf-admission-v1',
      iceRpmApplicability: 'APPLICABLE',
      tripRpmProfile: 'RPM_1HZ',
      vehicleActiveRpmProfile: 'RPM_1HZ',
      processingStatus: 'ENABLED',
      processingAllowed: true,
      reasonCode: 'RPM_1HZ_WITH_HF_DATA',
      reasonSummary: 'fixture',
    },
    dataQuality: {
      contractVersion: 'ds4-rpm-hf-data-quality-v1',
      validPointCount: input.rpmPoints.length,
      invalidValueCount: 0,
      duplicateTimestampCount: 0,
      earliestRecordedAtIso: input.rpmPoints[0]?.recordedAtIso ?? null,
      latestRecordedAtIso: input.rpmPoints[input.rpmPoints.length - 1]?.recordedAtIso ?? null,
      observedIntervals: {
        intervalCount: Math.max(0, input.rpmPoints.length - 1),
        intervalMedianSeconds: 1,
        intervalP95Seconds: 2,
        minIntervalSeconds: 1,
        maxIntervalSeconds: 2,
      },
      identifiedGaps: [],
      completenessLabel: 'COMPLETE',
      totalMatchingCount: input.rpmPoints.length,
      returnedPointCount: input.rpmPoints.length,
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
    rpmPoints: input.rpmPoints,
    vsiActiveRpmProfileSnapshot: null,
    vsiRpmCadenceTierSnapshot: snapshot,
    tierEvidence,
    readOnly: true,
    productionActivationForbidden: true,
  };
}
