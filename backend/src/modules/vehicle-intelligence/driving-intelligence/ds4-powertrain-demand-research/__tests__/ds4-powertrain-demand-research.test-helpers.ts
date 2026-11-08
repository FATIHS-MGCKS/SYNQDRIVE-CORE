import { resolveTelemetrySourceFamily } from '../../../telemetry-source-family';
import { processDs4RpmHfV1bShadowTripTierAware } from '../../rpm-hf-v1b/ds4-rpm-hf-v1b-tier-processor';
import {
  buildRpmPointsEverySeconds,
  buildTierTripClassification,
  buildTierTripInput,
  TIER_TEST_LINK,
  TIER_TEST_ORG,
  TIER_TEST_TRIP,
  TIER_TEST_VEHICLE,
} from '../../rpm-hf-v1b/__tests__/ds4-rpm-hf-v1b-tier-fixtures';
import { buildDs4RpmReferenceIntelligenceV1ReferenceBlock } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1-reference-input';
import type { Ds4RpmReferenceIntelligenceV1ComputeInput } from '../../rpm-reference-intelligence-v1/ds4-rpm-reference-intelligence-v1.contract';
import type {
  Ds4MultichannelBucketObservationV1,
  Ds4PowertrainDemandColdEngineResearchInputV1,
  Ds4PowertrainDemandResearchInputV1,
} from '../ds4-powertrain-demand-research.contract.v1';
import { DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION } from '../ds4-powertrain-demand-research.contract.v1';
import { computeMultichannelContentFingerprint } from '../ds4-powertrain-demand-research.input-binding.v1';

const API_SYNTHETIC_DIMO = {
  syntheticDevice: { id: 'fixture-synthetic-device' },
};

export const R1_DIMO = {
  aftermarketDevice: { serial: 'R1-TEST-001' },
};

export function buildObservationSeries(
  startIso: string,
  count: number,
  stepSec: number,
  map: (index: number) => Partial<Ds4MultichannelBucketObservationV1>,
): Ds4MultichannelBucketObservationV1[] {
  const baseMs = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => {
    const recordedAtIso = new Date(baseMs + i * stepSec * 1000).toISOString();
    return { recordedAtIso, ...map(i) };
  });
}

export function buildBoundPowertrainInput(input: {
  multichannelObservations: Ds4MultichannelBucketObservationV1[];
  dimoVehicleRawJson?: unknown;
  evidenceOrigin?: Ds4PowertrainDemandResearchInputV1['evidenceOrigin'];
  multichannelManifest?: Ds4PowertrainDemandResearchInputV1['multichannelManifest'];
  fuelType?: string | null;
  isEvPowertrain?: boolean;
  declaredIceOperationConfirmed?: boolean | null;
  tripId?: string;
  linkId?: string;
}): Ds4PowertrainDemandResearchInputV1 {
  const tripId = input.tripId ?? TIER_TEST_TRIP;
  const linkId = input.linkId ?? TIER_TEST_LINK;
  const rpmPoints = [...input.multichannelObservations]
    .filter((r) => r.rpm != null)
    .map((r) => ({
      recordedAtIso: new Date(Date.parse(r.recordedAtIso)).toISOString(),
      valueRpm: r.rpm as number,
    }));
  if (rpmPoints.length < 8) {
    throw new Error('fixture requires at least 8 rpm-labelled buckets');
  }

  const tripInput = buildTierTripInput({
    rpmPoints,
    tierRow: buildTierTripClassification({ tier: 'RPM_1S', tripId } as never),
    tripId,
    providerSourceLinkId: linkId,
  });

  const tierOut = processDs4RpmHfV1bShadowTripTierAware({
    tripInput,
    attemptCount: 1,
    computedAt: new Date('2026-01-01T11:00:00.000Z'),
    existingSucceededFingerprint: null,
  });
  if (tierOut.kind !== 'SUCCEEDED') {
    throw new Error(`fixture v1b failed: ${tierOut.kind}`);
  }

  const dimo = input.dimoVehicleRawJson ?? API_SYNTHETIC_DIMO;
  const family = resolveTelemetrySourceFamily(dimo) ?? 'UNKNOWN';
  const mcFp = computeMultichannelContentFingerprint({
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    providerSourceLinkId: linkId,
    telemetrySourceFamily: family,
    observations: input.multichannelObservations,
  });

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: input.evidenceOrigin ?? 'SYNTHETIC_FIXTURE',
    sourceBundleId: null,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    providerSourceLinkId: linkId,
    dimoVehicleRawJson: dimo,
    tripInput,
    v1bResult: tierOut.result,
    multichannelObservations: input.multichannelObservations,
    multichannelManifest: input.multichannelManifest ?? null,
    multichannelFingerprint: mcFp,
    fuelType: input.fuelType ?? 'GASOLINE',
    isEvPowertrain: input.isEvPowertrain ?? false,
    declaredIceOperationConfirmed: input.declaredIceOperationConfirmed ?? null,
  };
}

export function positiveKickdownGrid(): Ds4MultichannelBucketObservationV1[] {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', 12, 1, (i) => {
    if (i === 0) return { throttlePct: 25, rpm: 2000, speedKmh: 55, loadPct: 45 };
    if (i === 1) return { throttlePct: 55, rpm: 2600, speedKmh: 62, loadPct: 60 };
    if (i === 2) return { throttlePct: 92, rpm: 3200, speedKmh: 70, loadPct: 78 };
    return { throttlePct: 40, rpm: 2400, speedKmh: 72, loadPct: 50 };
  });
}

export function buildTrustedVehicleRpmReference(
  maxRpm = 6000,
): Ds4RpmReferenceIntelligenceV1ComputeInput['reference'] {
  return buildDs4RpmReferenceIntelligenceV1ReferenceBlock({
    idleRpm: 750,
    maxRpm,
    idleRpmProvenance: { category: 'USER_CONFIRMED' },
    maxRpmProvenance: { category: 'USER_CONFIRMED' },
    iceRpmApplicability: 'APPLICABLE',
  });
}

function multichannelObservationsHaveRpm(observations: readonly Ds4MultichannelBucketObservationV1[]): boolean {
  return observations.some((r) => r.rpm != null);
}

export function buildColdEngineBoundInput(input: {
  multichannelObservations: Ds4MultichannelBucketObservationV1[];
  dimoVehicleRawJson?: unknown;
  evidenceOrigin?: Ds4PowertrainDemandResearchInputV1['evidenceOrigin'];
  multichannelManifest?: Ds4PowertrainDemandResearchInputV1['multichannelManifest'];
  fuelType?: string | null;
  isEvPowertrain?: boolean;
  declaredIceOperationConfirmed?: boolean | null;
  tripId?: string;
  linkId?: string;
  vehicleRpmReference?: Ds4RpmReferenceIntelligenceV1ComputeInput['reference'];
  vehicleRpmReferenceBinding?: { organizationId: string; vehicleId: string } | null;
  /** When set, forces trip HF read semantics for adversarial incomplete-read fixtures. */
  rpmCompletenessLabel?: 'COMPLETE' | 'EMPTY' | 'INCOMPLETE_MORE_POINTS_AVAILABLE';
}): Ds4PowertrainDemandColdEngineResearchInputV1 {
  const tripId = input.tripId ?? TIER_TEST_TRIP;
  const linkId = input.linkId ?? TIER_TEST_LINK;
  const rpmInMc = multichannelObservationsHaveRpm(input.multichannelObservations);

  const rpmPoints = rpmInMc
    ? input.multichannelObservations
        .filter((r) => r.rpm != null)
        .map((r) => ({
          recordedAtIso: new Date(Date.parse(r.recordedAtIso)).toISOString(),
          valueRpm: r.rpm as number,
        }))
    : [];

  if (rpmInMc && rpmPoints.length < 8) {
    throw new Error('cold-engine fixture with RPM labels requires at least 8 rpm-labelled buckets');
  }

  let tripInput = buildTierTripInput({
    rpmPoints,
    tierRow: buildTierTripClassification({ tier: 'RPM_1S', tripId } as never),
    tripId,
    providerSourceLinkId: linkId,
  });

  if (!rpmInMc) {
    tripInput = {
      ...tripInput,
      dataQuality: {
        ...tripInput.dataQuality,
        validPointCount: 0,
        returnedPointCount: 0,
        totalMatchingCount: 0,
        completenessLabel: input.rpmCompletenessLabel ?? 'EMPTY',
        earliestRecordedAtIso: null,
        latestRecordedAtIso: null,
      },
      rpmPoints: [],
    };
  } else if (input.rpmCompletenessLabel != null) {
    tripInput = {
      ...tripInput,
      dataQuality: {
        ...tripInput.dataQuality,
        completenessLabel: input.rpmCompletenessLabel,
      },
    };
  }

  const v1bResult = rpmInMc
    ? (() => {
        const tierOut = processDs4RpmHfV1bShadowTripTierAware({
          tripInput,
          attemptCount: 1,
          computedAt: new Date('2026-01-01T11:00:00.000Z'),
          existingSucceededFingerprint: null,
        });
        if (tierOut.kind !== 'SUCCEEDED') {
          throw new Error(`fixture v1b failed: ${tierOut.kind}`);
        }
        return tierOut.result;
      })()
    : null;

  const dimo = input.dimoVehicleRawJson ?? API_SYNTHETIC_DIMO;
  const family = resolveTelemetrySourceFamily(dimo) ?? 'UNKNOWN';
  const mcFp = computeMultichannelContentFingerprint({
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    providerSourceLinkId: linkId,
    telemetrySourceFamily: family,
    observations: input.multichannelObservations,
  });

  const defaultReference = buildTrustedVehicleRpmReference(6000);
  const vehicleRpmReference =
    input.vehicleRpmReference === undefined ? defaultReference : input.vehicleRpmReference;
  const vehicleRpmReferenceBinding =
    input.vehicleRpmReferenceBinding === undefined
      ? { organizationId: TIER_TEST_ORG, vehicleId: TIER_TEST_VEHICLE }
      : input.vehicleRpmReferenceBinding;

  return {
    contractVersion: DS4_POWERTRAIN_DEMAND_RESEARCH_CONTRACT_VERSION,
    evidenceOrigin: input.evidenceOrigin ?? 'SYNTHETIC_FIXTURE',
    sourceBundleId: null,
    organizationId: TIER_TEST_ORG,
    vehicleId: TIER_TEST_VEHICLE,
    tripId,
    providerSourceLinkId: linkId,
    dimoVehicleRawJson: dimo,
    tripInput,
    v1bResult,
    multichannelObservations: input.multichannelObservations,
    multichannelManifest: input.multichannelManifest ?? null,
    multichannelFingerprint: mcFp,
    fuelType: input.fuelType ?? 'GASOLINE',
    isEvPowertrain: input.isEvPowertrain ?? false,
    declaredIceOperationConfirmed: input.declaredIceOperationConfirmed ?? null,
    vehicleRpmReference,
    vehicleRpmReferenceBinding,
  };
}

export function coldEctGrid(
  coldCount: number,
  map: (i: number) => Partial<Ds4MultichannelBucketObservationV1>,
): Ds4MultichannelBucketObservationV1[] {
  return buildObservationSeries('2026-01-01T10:00:01.000Z', coldCount, 1, (i) => ({
    coolantC: 42,
    speedKmh: 0,
    ...map(i),
  }));
}

export { API_SYNTHETIC_DIMO, buildRpmPointsEverySeconds };
