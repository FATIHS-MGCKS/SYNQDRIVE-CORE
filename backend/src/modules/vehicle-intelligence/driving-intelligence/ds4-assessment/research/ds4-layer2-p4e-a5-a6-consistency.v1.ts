import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import type { Ds4LongitudinalLoadKindObservablesV1, Ds4LongitudinalLoadObservablesV1 } from '../ds4-longitudinal-load-observables.v1.contract';
import type { Ds4Layer2P4bEventSpeedEvidenceRowV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import type {
  Ds4Layer2P4eA5A6CohortSummaryV1,
  Ds4Layer2P4eA5A6TripDiagnosticsV1,
  Ds4Layer2P4eA5EventConsistencyDiagnosticV1,
  Ds4Layer2P4eA5SecantSupportStatusV1,
  Ds4Layer2P4eA5ShapeIndexStatusV1,
  Ds4Layer2P4eA5SpeedSupportDurationTierV1,
  Ds4Layer2P4eA6KindTierDecompositionV1,
  Ds4Layer2P4eA6TierImpulseSemanticsV1,
  Ds4Layer2P4eA6TripTierDecompositionV1,
} from './ds4-layer2-p4e-a5-a6-consistency.v1.contract';
import { DS4_LAYER2_P4E_A5_A6_CONSISTENCY_SCHEMA_VERSION_V1 } from './ds4-layer2-p4e-a5-a6-consistency.v1.contract';

const ADMISSIBLE = new Set(['ADMISSIBLE_FULL', 'ADMISSIBLE_BIN_ONLY']);
const FULL_CLASSIFICATION = 'ADMISSIBLE_FULL';
const BIN_CLASSIFICATION = 'ADMISSIBLE_BIN_ONLY';
const IMPULSE_TOLERANCE = 1e-6;

function resolveSpeedSupportDurationTier(durationTier: string): Ds4Layer2P4eA5SpeedSupportDurationTierV1 {
  if (durationTier === 'FULL_ELIGIBLE') return 'FULL_ELIGIBLE';
  if (durationTier === 'BIN_ONLY') return 'BIN_ONLY';
  return 'OTHER';
}

function boundaryDeltaSpeedMps(startKmh: number, endKmh: number): number {
  return Math.abs(endKmh - startKmh) / 3.6;
}

/**
 * Secant magnitude from boundary speeds and duration [m/s²].
 * Uses actual duration (not max(duration,1)) to match P2 persisted mean semantics for T≥1.
 */
export function computeDs4Layer2P4eA5SecantAccelMps2V1(input: {
  startSpeedKmh: number;
  endSpeedKmh: number;
  durationS: number;
}): number | null {
  if (!Number.isFinite(input.durationS) || input.durationS <= 0) return null;
  return boundaryDeltaSpeedMps(input.startSpeedKmh, input.endSpeedKmh) / input.durationS;
}

/**
 * Dimensionless event-shape index (Fable A5):
 * (v̄_window − v_mid) / |Δv_boundary| with v in km/h.
 * Near-zero for linear in-window speed vs boundary chord; UNAVAILABLE when |Δv|=0 or window mean missing.
 * Does not treat repaired/interpolated samples as independent measurements (uses P4B aggregated window mean only).
 */
export function computeDs4Layer2P4eA5EventShapeIndexV1(input: {
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  windowMeanSpeedKmh: number | null;
}): { shapeIndex: number | null; status: Ds4Layer2P4eA5ShapeIndexStatusV1 } {
  if (
    input.startSpeedKmh == null ||
    input.endSpeedKmh == null ||
    !Number.isFinite(input.startSpeedKmh) ||
    !Number.isFinite(input.endSpeedKmh)
  ) {
    return { shapeIndex: null, status: 'UNAVAILABLE_MISSING_BOUNDARY_SPEED' };
  }
  const deltaKmh = Math.abs(input.endSpeedKmh - input.startSpeedKmh);
  if (deltaKmh === 0) {
    return { shapeIndex: null, status: 'UNAVAILABLE_ZERO_BOUNDARY_DELTA' };
  }
  if (input.windowMeanSpeedKmh == null || !Number.isFinite(input.windowMeanSpeedKmh)) {
    return { shapeIndex: null, status: 'UNAVAILABLE_MISSING_WINDOW_MEAN' };
  }
  const mid = (input.startSpeedKmh + input.endSpeedKmh) / 2;
  return { shapeIndex: (input.windowMeanSpeedKmh - mid) / deltaKmh, status: 'DEFINED' };
}

export function buildDs4Layer2P4eA5EventConsistencyDiagnosticV1(input: {
  evidence: Ds4Layer2P4bEventSpeedEvidenceRowV1;
  intensity: Ds4EventIntensityEligibilityRecordV1 | null;
}): Ds4Layer2P4eA5EventConsistencyDiagnosticV1 {
  const { evidence, intensity } = input;
  const durationS = intensity?.durationS ?? null;
  const meanAccelMps2 = intensity?.meanAccelMps2 ?? null;
  const start = evidence.startSpeedKmh;
  const end = evidence.endSpeedKmh;

  let secantSupportStatus: Ds4Layer2P4eA5SecantSupportStatusV1 = 'SUPPORTED';
  let secantAccelMps2: number | null = null;
  let boundaryDeltaMps: number | null = null;
  let secantImpulseResidualMps: number | null = null;
  let secantAccelResidualMps2: number | null = null;

  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) {
    secantSupportStatus = 'UNAVAILABLE_MISSING_BOUNDARY_SPEED';
  } else if (durationS == null || !Number.isFinite(durationS) || durationS <= 0) {
    secantSupportStatus = 'UNAVAILABLE_ZERO_DURATION';
  } else if (meanAccelMps2 == null || !Number.isFinite(meanAccelMps2)) {
    secantSupportStatus = 'UNAVAILABLE_MISSING_MEAN_ACCEL';
  } else {
    boundaryDeltaMps = boundaryDeltaSpeedMps(start, end);
    secantAccelMps2 = boundaryDeltaMps / durationS;
    secantImpulseResidualMps = meanAccelMps2 * durationS - boundaryDeltaMps;
    secantAccelResidualMps2 = meanAccelMps2 - secantAccelMps2;
  }

  const shape = computeDs4Layer2P4eA5EventShapeIndexV1({
    startSpeedKmh: start,
    endSpeedKmh: end,
    windowMeanSpeedKmh: evidence.windowMeanSpeedKmh,
  });

  return {
    tripId: evidence.tripId,
    eventIndex: evidence.eventIndex,
    eventKind: evidence.eventKind,
    durationTier: evidence.durationTier,
    speedSupportDurationTier: resolveSpeedSupportDurationTier(evidence.durationTier),
    eligibilityClassification: evidence.eligibilityClassification,
    durationS,
    meanAccelMps2,
    startSpeedKmh: start,
    endSpeedKmh: end,
    boundaryDeltaSpeedMps: boundaryDeltaMps,
    secantAccelMps2,
    secantImpulseResidualMps,
    secantImpulseResidualAbsMps:
      secantImpulseResidualMps == null ? null : Math.abs(secantImpulseResidualMps),
    secantAccelResidualMps2,
    secantAccelResidualAbsMps2:
      secantAccelResidualMps2 == null ? null : Math.abs(secantAccelResidualMps2),
    secantSupportStatus,
    eventShapeIndex: shape.shapeIndex,
    eventShapeIndexStatus: shape.status,
    windowMeanSpeedKmh: evidence.windowMeanSpeedKmh,
    windowEvidenceClass: evidence.windowEvidenceClass,
    boundaryEvidenceClass: evidence.boundaryEvidenceClass,
    repairInfluenced: evidence.repairInfluenced,
  };
}

function kindFromRecord(record: Ds4EventIntensityEligibilityRecordV1): 'acceleration' | 'deceleration' | null {
  if (record.kind === 'ACCELERATION') return 'acceleration';
  if (record.kind === 'DECELERATION') return 'deceleration';
  return null;
}

function sumTierImpulse(
  records: readonly Ds4EventIntensityEligibilityRecordV1[],
  kind: 'acceleration' | 'deceleration',
  classification: typeof FULL_CLASSIFICATION | typeof BIN_CLASSIFICATION,
): { impulse: number; count: number; valid: boolean } {
  let impulse = 0;
  let count = 0;
  for (const record of records) {
    if (kindFromRecord(record) !== kind) continue;
    if (record.classification !== classification) continue;
    const a = record.meanAccelMps2;
    const t = record.durationS;
    if (a == null || t == null || !Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t < 0) {
      return { impulse: 0, count: 0, valid: false };
    }
    impulse += a * t;
    count += 1;
  }
  return { impulse, count, valid: true };
}

function resolveTierSemantics(input: {
  loadKind: Ds4LongitudinalLoadKindObservablesV1;
}): Ds4Layer2P4eA6TierImpulseSemanticsV1 {
  if (input.loadKind.impulseSemantics === 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS') {
    if (
      input.loadKind.admissibleEventCount === 0 &&
      input.loadKind.specificLongitudinalImpulseMps === 0
    ) {
      return 'ZERO_LOAD';
    }
    return 'DECOMPOSED';
  }
  return 'UNAVAILABLE';
}

export function computeDs4Layer2P4eA6KindTierDecompositionV1(input: {
  kind: 'acceleration' | 'deceleration';
  records: readonly Ds4EventIntensityEligibilityRecordV1[];
  loadKindObservables: Ds4LongitudinalLoadKindObservablesV1;
}): Ds4Layer2P4eA6KindTierDecompositionV1 {
  const full = sumTierImpulse(input.records, input.kind, FULL_CLASSIFICATION);
  const bin = sumTierImpulse(input.records, input.kind, BIN_CLASSIFICATION);
  const semantics = resolveTierSemantics({ loadKind: input.loadKindObservables });
  const loadB = input.loadKindObservables.specificLongitudinalImpulseMps;

  let bFullMps: number | null = null;
  let bBinOnlyMps: number | null = null;
  let bTotalMps: number | null = null;
  let fullShare: number | null = null;
  let binShare: number | null = null;
  let bTotalMatches: boolean | null = null;
  let sumMatches: boolean | null = null;

  if (semantics === 'ZERO_LOAD') {
    bFullMps = 0;
    bBinOnlyMps = 0;
    bTotalMps = 0;
    fullShare = null;
    binShare = null;
    bTotalMatches = loadB === 0;
    sumMatches = true;
  } else if (semantics === 'DECOMPOSED' && full.valid && bin.valid) {
    bFullMps = full.impulse;
    bBinOnlyMps = bin.impulse;
    bTotalMps = full.impulse + bin.impulse;
    if (bTotalMps > 0) {
      fullShare = bFullMps / bTotalMps;
      binShare = bBinOnlyMps / bTotalMps;
    } else {
      fullShare = null;
      binShare = null;
    }
    bTotalMatches =
      loadB != null && Math.abs(loadB - bTotalMps) <= IMPULSE_TOLERANCE;
    sumMatches = Math.abs(bFullMps + bBinOnlyMps - bTotalMps) <= IMPULSE_TOLERANCE;
  }

  return {
    kind: input.kind,
    bTotalMps,
    bFullMps,
    bBinOnlyMps,
    fullContributionShare: fullShare,
    binOnlyContributionShare: binShare,
    admissibleEventCount: input.loadKindObservables.admissibleEventCount,
    fullEventCount: input.loadKindObservables.fullEventCount,
    binOnlyEventCount: input.loadKindObservables.binOnlyEventCount,
    tierImpulseSemantics: semantics,
    loadKindObservables: input.loadKindObservables,
    bTotalMatchesLoadModelB: bTotalMatches,
    bFullPlusBinMatchesTotal: sumMatches,
  };
}

export function buildDs4Layer2P4eA6TripTierDecompositionV1(input: {
  tripId: string;
  longitudinalLoad: Ds4LongitudinalLoadObservablesV1;
  records: readonly Ds4EventIntensityEligibilityRecordV1[];
}): Ds4Layer2P4eA6TripTierDecompositionV1 {
  return {
    tripId: input.tripId,
    acceleration: computeDs4Layer2P4eA6KindTierDecompositionV1({
      kind: 'acceleration',
      records: input.records,
      loadKindObservables: input.longitudinalLoad.acceleration,
    }),
    deceleration: computeDs4Layer2P4eA6KindTierDecompositionV1({
      kind: 'deceleration',
      records: input.records,
      loadKindObservables: input.longitudinalLoad.deceleration,
    }),
  };
}

export function buildDs4Layer2P4eA5A6TripDiagnosticsV1(input: {
  tripId: string;
  longitudinalLoad: Ds4LongitudinalLoadObservablesV1;
  records: readonly Ds4EventIntensityEligibilityRecordV1[];
  evidenceRows: readonly Ds4Layer2P4bEventSpeedEvidenceRowV1[];
}): Ds4Layer2P4eA5A6TripDiagnosticsV1 {
  const intensityByIndex = new Map(input.records.map((r) => [r.eventIndex, r]));
  const a5Events = input.evidenceRows
    .filter((e) => e.tripId === input.tripId)
    .sort((a, b) => a.eventIndex - b.eventIndex)
    .map((evidence) =>
      buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
        evidence,
        intensity: intensityByIndex.get(evidence.eventIndex) ?? null,
      }),
    );

  return {
    tripId: input.tripId,
    a5Events,
    a6: buildDs4Layer2P4eA6TripTierDecompositionV1({
      tripId: input.tripId,
      longitudinalLoad: input.longitudinalLoad,
      records: input.records,
    }),
  };
}

export function summarizeDs4Layer2P4eA5A6CohortV1(input: {
  trips: readonly Ds4Layer2P4eA5A6TripDiagnosticsV1[];
  admissibleEventCount: number;
}): Ds4Layer2P4eA5A6CohortSummaryV1 {
  let a5SecantSupported = 0;
  let a5ShapeDefined = 0;
  let a5SecantUnavailable = 0;
  let a5ShapeUnavailable = 0;
  let maxAbsImpulse: number | null = null;

  let a6Decomposed = 0;
  let a6Zero = 0;
  let a6Unavailable = 0;

  for (const trip of input.trips) {
    for (const ev of trip.a5Events) {
      if (ev.secantSupportStatus === 'SUPPORTED') {
        a5SecantSupported += 1;
        if (ev.secantImpulseResidualAbsMps != null) {
          maxAbsImpulse =
            maxAbsImpulse == null
              ? ev.secantImpulseResidualAbsMps
              : Math.max(maxAbsImpulse, ev.secantImpulseResidualAbsMps);
        }
      } else {
        a5SecantUnavailable += 1;
      }
      if (ev.eventShapeIndexStatus === 'DEFINED') a5ShapeDefined += 1;
      else a5ShapeUnavailable += 1;
    }
    for (const kind of [trip.a6.acceleration, trip.a6.deceleration]) {
      if (kind.tierImpulseSemantics === 'DECOMPOSED') a6Decomposed += 1;
      else if (kind.tierImpulseSemantics === 'ZERO_LOAD') a6Zero += 1;
      else a6Unavailable += 1;
    }
  }

  return {
    schemaVersion: DS4_LAYER2_P4E_A5_A6_CONSISTENCY_SCHEMA_VERSION_V1,
    admissibleEventCount: input.admissibleEventCount,
    a5SecantSupportedCount: a5SecantSupported,
    a5ShapeDefinedCount: a5ShapeDefined,
    a5SecantUnavailableCount: a5SecantUnavailable,
    a5ShapeUnavailableCount: a5ShapeUnavailable,
    a6KindCellsDecomposed: a6Decomposed,
    a6KindCellsZeroLoad: a6Zero,
    a6KindCellsUnavailable: a6Unavailable,
    maxAbsSecantImpulseResidualMps: maxAbsImpulse,
  };
}

export function filterAdmissibleIntensityRecordsV1(
  records: readonly Ds4EventIntensityEligibilityRecordV1[],
): Ds4EventIntensityEligibilityRecordV1[] {
  return records.filter((r) => ADMISSIBLE.has(r.classification));
}
