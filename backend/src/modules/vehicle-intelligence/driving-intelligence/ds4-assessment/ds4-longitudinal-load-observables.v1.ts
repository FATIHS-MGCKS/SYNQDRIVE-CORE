/**
 * DS4 Layer 2 — longitudinal driving load observables (pure compute).
 *
 * Inputs: persisted DS4 Trip Assessment V1 `eventSummaries` + status/evidence.
 * No telemetry, no Motion re-decode, no customer scores.
 *
 * Units:
 * - a_i, I_k, a50, a90, amax: m/s²
 * - T_i, E_s: s
 * - B_k (specificLongitudinalImpulseMps): m/s (sum of per-event Δv under secant semantics)
 * - D: km
 * - Phi_k: events/min; Phi_d_k: events/km
 *
 * Percentiles: linear interpolation between closest ranks (inclusive method on sorted FULL intensities).
 */

import type { Ds4EventIntensityEligibilityRecordV1 } from './ds4-assessment-event-intensity-eligibility.v1';
import type {
  Ds4TripAssessmentComputeResultV1,
  Ds4TripAssessmentEventSummariesV1,
} from './ds4-trip-assessment-v1.engine';
import type { Ds4SpeedAuthorityPartitionV1, Ds4TripAssessmentStatusV1 } from './ds4-trip-assessment-v1.contract';
import { emptyDs4DrivingExposureV1, type Ds4DrivingExposureV1 } from './ds4-assessment-driving-exposure.v1';
import {
  DS4_LONGITUDINAL_LOAD_ELIGIBLE_ASSESSMENT_STATUSES_V1,
  DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED,
  DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1,
  type Ds4LongitudinalLoadKindObservablesV1,
  type Ds4LongitudinalLoadObservablesInputV1,
  type Ds4LongitudinalLoadObservablesV1,
  type Ds4LongitudinalLoadReasonCodeV1,
} from './ds4-longitudinal-load-observables.v1.contract';
import {
  resolveDs4LongitudinalEvidenceQualityForLayer2V1,
  type Ds4LongitudinalEvidenceQualityContextV1,
} from './ds4-longitudinal-evidence-quality.v1';

const ADMISSIBLE_CLASSIFICATIONS = new Set(['ADMISSIBLE_FULL', 'ADMISSIBLE_BIN_ONLY']);
const FULL_CLASSIFICATION = 'ADMISSIBLE_FULL';

function emptyKindObservables(): Ds4LongitudinalLoadKindObservablesV1 {
  return {
    admissibleEventCount: 0,
    fullEventCount: 0,
    binOnlyEventCount: 0,
    specificLongitudinalImpulseMps: null,
    impulseSemantics: 'UNAVAILABLE',
    normalizedMeanAccelMps2: null,
    eventFrequencyPerMinute: null,
    eventFrequencyPerKm: null,
    maneuverTimeShare: null,
    intensityMedianFullMps2: null,
    intensityP90FullMps2: null,
    intensityMaxAdmissibleMps2: null,
  };
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Linear interpolation percentile on sorted finite values (inclusive / Excel PERCENTILE.INC style).
 * `p` in [0, 1]. Returns null for empty input.
 */
export function percentileLinearInclusiveSorted(sortedAsc: readonly number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (!Number.isFinite(p) || p < 0 || p > 1) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = p * (sortedAsc.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedAsc[lower]!;
  const weight = pos - lower;
  return sortedAsc[lower]! + weight * (sortedAsc[upper]! - sortedAsc[lower]!);
}

function medianSorted(sortedAsc: readonly number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 1) return sortedAsc[mid]!;
  return (sortedAsc[mid - 1]! + sortedAsc[mid]!) / 2;
}

function isAdmissibleRecord(record: Ds4EventIntensityEligibilityRecordV1): boolean {
  return ADMISSIBLE_CLASSIFICATIONS.has(record.classification);
}

function kindBucket(record: Ds4EventIntensityEligibilityRecordV1): 'acceleration' | 'deceleration' | null {
  if (record.kind === 'ACCELERATION') return 'acceleration';
  if (record.kind === 'DECELERATION') return 'deceleration';
  return null;
}

function countKindNonAdmissibleRecords(
  records: readonly Ds4EventIntensityEligibilityRecordV1[],
  kind: 'acceleration' | 'deceleration',
): number {
  let count = 0;
  for (const record of records) {
    if (kindBucket(record) !== kind) continue;
    if (!isAdmissibleRecord(record)) count += 1;
  }
  return count;
}

/**
 * Kind-scoped zero-load gate (P4E A2): true zero B/I/Phi/S only when this kind has zero admissible
 * events, collection is complete, trip exposure gates are open, and there is no UNRATED/EXCLUDED
 * evidence for this kind in the intensity record set.
 */
function isKindZeroLoadValidV1(input: {
  kindAdmissibleCount: number;
  kindNonAdmissibleCount: number;
  collectionComplete: boolean;
  canComputeMetrics: boolean;
  tripLevelZeroLoadValid: boolean;
  tripAdmissibleCount: number;
}): boolean {
  if (!input.canComputeMetrics || !input.collectionComplete || input.kindAdmissibleCount !== 0) {
    return false;
  }
  if (input.kindNonAdmissibleCount > 0) {
    return false;
  }
  return input.tripLevelZeroLoadValid || input.tripAdmissibleCount > 0;
}

function roundDisplay(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

type KindAccumulator = {
  admissible: Ds4EventIntensityEligibilityRecordV1[];
  fullIntensities: number[];
  allIntensities: number[];
};

function accumulateKind(records: readonly Ds4EventIntensityEligibilityRecordV1[]): KindAccumulator {
  const acc: KindAccumulator = { admissible: [], fullIntensities: [], allIntensities: [] };
  for (const record of records) {
    if (!isAdmissibleRecord(record)) continue;
    acc.admissible.push(record);
    if (record.meanAccelMps2 != null && Number.isFinite(record.meanAccelMps2)) {
      acc.allIntensities.push(record.meanAccelMps2);
    }
    if (record.classification === FULL_CLASSIFICATION && record.meanAccelMps2 != null && Number.isFinite(record.meanAccelMps2)) {
      acc.fullIntensities.push(record.meanAccelMps2);
    }
  }
  acc.fullIntensities.sort((a, b) => a - b);
  acc.allIntensities.sort((a, b) => a - b);
  return acc;
}

function computeKindMetrics(
  acc: KindAccumulator,
  exposureSeconds: number,
  distanceKm: number,
  tripGatesOpen: boolean,
  zeroLoadValid: boolean,
): Ds4LongitudinalLoadKindObservablesV1 {
  const n = acc.admissible.length;
  const nFull = acc.fullIntensities.length;
  const nBin = n - nFull;

  let impulseSum = 0;
  let durationSum = 0;
  let impulseValid = true;

  for (const record of acc.admissible) {
    const a = record.meanAccelMps2;
    const t = record.durationS;
    if (a == null || t == null || !Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t < 0) {
      impulseValid = false;
      break;
    }
    impulseSum += a * t;
    durationSum += t;
  }

  if (!tripGatesOpen) {
    return {
      ...emptyKindObservables(),
      admissibleEventCount: n,
      fullEventCount: nFull,
      binOnlyEventCount: nBin,
    };
  }

  if (!impulseValid) {
    return {
      admissibleEventCount: n,
      fullEventCount: nFull,
      binOnlyEventCount: nBin,
      specificLongitudinalImpulseMps: null,
      impulseSemantics: 'UNAVAILABLE',
      normalizedMeanAccelMps2: null,
      eventFrequencyPerMinute: null,
      eventFrequencyPerKm: null,
      maneuverTimeShare: null,
      intensityMedianFullMps2: null,
      intensityP90FullMps2: null,
      intensityMaxAdmissibleMps2: null,
    };
  }

  if (n === 0 && !zeroLoadValid) {
    return {
      admissibleEventCount: 0,
      fullEventCount: 0,
      binOnlyEventCount: 0,
      specificLongitudinalImpulseMps: null,
      impulseSemantics: 'UNAVAILABLE',
      normalizedMeanAccelMps2: null,
      eventFrequencyPerMinute: null,
      eventFrequencyPerKm: null,
      maneuverTimeShare: null,
      intensityMedianFullMps2: null,
      intensityP90FullMps2: null,
      intensityMaxAdmissibleMps2: null,
    };
  }

  const b = n === 0 ? 0 : impulseSum;
  const i = b / exposureSeconds;
  const phi = (60 * n) / exposureSeconds;
  const phiD = distanceKm > 0 ? n / distanceKm : null;
  const s = durationSum / exposureSeconds;

  const aMax = acc.allIntensities.length > 0 ? acc.allIntensities[acc.allIntensities.length - 1]! : null;
  const a50 = nFull >= 3 ? medianSorted(acc.fullIntensities) : null;
  const a90 = nFull >= 10 ? percentileLinearInclusiveSorted(acc.fullIntensities, 0.9) : null;

  return {
    admissibleEventCount: n,
    fullEventCount: nFull,
    binOnlyEventCount: nBin,
    specificLongitudinalImpulseMps: roundDisplay(b, 6),
    impulseSemantics: 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS',
    normalizedMeanAccelMps2: roundDisplay(i, 6),
    eventFrequencyPerMinute: roundDisplay(phi, 6),
    eventFrequencyPerKm: phiD == null ? null : roundDisplay(phiD, 6),
    maneuverTimeShare: roundDisplay(s, 6),
    intensityMedianFullMps2: a50 == null ? null : roundDisplay(a50, 6),
    intensityP90FullMps2: a90 == null ? null : roundDisplay(a90, 6),
    intensityMaxAdmissibleMps2: aMax == null ? null : roundDisplay(aMax, 6),
  };
}

function validateRecords(records: readonly Ds4EventIntensityEligibilityRecordV1[]): Ds4LongitudinalLoadReasonCodeV1 | null {
  const seen = new Set<number>();
  for (const record of records) {
    if (!Number.isInteger(record.eventIndex) || record.eventIndex < 0) {
      return 'EVENT_RECORDS_INCONSISTENT';
    }
    if (seen.has(record.eventIndex)) return 'DUPLICATE_EVENT_INDEX';
    seen.add(record.eventIndex);
    if (isAdmissibleRecord(record)) {
      const a = record.meanAccelMps2;
      const t = record.durationS;
      if (a != null && (!Number.isFinite(a) || a <= 0)) return 'NON_FINITE_INPUT';
      if (t != null && (!Number.isFinite(t) || t < 0)) return 'NON_FINITE_INPUT';
    }
  }
  return null;
}

function buildDs4LongitudinalLoadObservablesInputCoreV1(input: {
  assessmentStatus: Ds4TripAssessmentStatusV1;
  evidenceQuality: string | null;
  longitudinalEvidenceSupplementaryReasonCodes?: Ds4LongitudinalLoadReasonCodeV1[];
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  eventSummaries: Ds4TripAssessmentEventSummariesV1;
}): Ds4LongitudinalLoadObservablesInputV1 {
  return {
    assessmentStatus: input.assessmentStatus,
    evidenceQuality: input.evidenceQuality,
    longitudinalEvidenceSupplementaryReasonCodes: input.longitudinalEvidenceSupplementaryReasonCodes,
    speedAuthority: input.speedAuthority,
    ratedEventCount: input.eventSummaries.ratedEventCount,
    unratedEventCount: input.eventSummaries.unratedEventCount,
    artefactSuspectCount: input.eventSummaries.artefactSuspectCount,
    drivingExposure: input.eventSummaries.drivingExposure,
    eventIntensityRecords: input.eventSummaries.eventIntensityRecords,
  };
}

function buildLayer2InputWithEvidenceContext(
  assessmentStatus: Ds4TripAssessmentStatusV1,
  assessmentEvidenceQuality: string | null,
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null,
  eventSummaries: Ds4TripAssessmentEventSummariesV1,
  context: Ds4LongitudinalEvidenceQualityContextV1 | null | undefined,
): Ds4LongitudinalLoadObservablesInputV1 {
  const resolved = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
    assessmentEvidenceQuality,
    speedAuthority,
    eventSummaries,
    context,
  });
  return buildDs4LongitudinalLoadObservablesInputCoreV1({
    assessmentStatus,
    evidenceQuality: resolved.layer2EvidenceQualityInput,
    longitudinalEvidenceSupplementaryReasonCodes: resolved.supplementaryReasonCodes,
    speedAuthority,
    eventSummaries,
  });
}

export function buildDs4LongitudinalLoadObservablesInputV1(
  assessment: Ds4TripAssessmentComputeResultV1,
  context?: Ds4LongitudinalEvidenceQualityContextV1 | null,
): Ds4LongitudinalLoadObservablesInputV1 {
  return buildLayer2InputWithEvidenceContext(
    assessment.assessmentStatus,
    assessment.evidenceQuality,
    assessment.speedAuthority,
    assessment.eventSummaries,
    context,
  );
}

/** Read-side adapter: persisted assessment row + eventSummariesJson (no motion recompute). */
export function buildDs4LongitudinalLoadObservablesInputFromPersistedAssessmentV1(input: {
  assessmentStatus: Ds4TripAssessmentStatusV1;
  evidenceQuality: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  eventSummariesJson: unknown;
  evidenceQualityContext?: Ds4LongitudinalEvidenceQualityContextV1 | null;
}): Ds4LongitudinalLoadObservablesInputV1 {
  const eventSummaries = coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1(
    input.eventSummariesJson,
    input.speedAuthority,
  );
  return buildLayer2InputWithEvidenceContext(
    input.assessmentStatus,
    input.evidenceQuality,
    input.speedAuthority,
    eventSummaries,
    input.evidenceQualityContext,
  );
}

export function projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1(input: {
  assessmentStatus: Ds4TripAssessmentStatusV1;
  evidenceQuality: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  eventSummariesJson: unknown;
  evidenceQualityContext?: Ds4LongitudinalEvidenceQualityContextV1 | null;
}): Ds4LongitudinalLoadObservablesV1 {
  return computeDs4LongitudinalLoadObservablesV1(
    buildDs4LongitudinalLoadObservablesInputFromPersistedAssessmentV1(input),
  );
}

function emptyIntensityKindCounts(): Ds4TripAssessmentEventSummariesV1['intensityAcceleration'] {
  return {
    totalEvents: 0,
    acceptedEvents: 0,
    excludedArtefacts: 0,
    unratedEvents: 0,
    admissibleEvents: 0,
    fullEligibleEvents: 0,
    binOnlyEvents: 0,
    admissibleShareOfAccepted: null,
    admissibleDurationSeconds: [],
    admissibleMeanAccelMps2: [],
  };
}

/**
 * Coerce persisted JSON into the Layer-2 input shape. Historical rows missing PR-A2 fields fail closed via compute gates.
 */
export function coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1(
  json: unknown,
  speedAuthorityFallback: Ds4SpeedAuthorityPartitionV1 | null,
): Ds4TripAssessmentEventSummariesV1 {
  const authority = speedAuthorityFallback ?? 'C4_ONLY';
  const emptyExposure = emptyDs4DrivingExposureV1(authority);
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return {
      acceptedAccelerationCount: 0,
      acceptedDecelerationCount: 0,
      artefactSuspectCount: 0,
      ratedEventCount: 0,
      unratedEventCount: 0,
      accelerationOrdinalValues: [],
      decelerationOrdinalValues: [],
      intensityAcceleration: emptyIntensityKindCounts(),
      intensityDeceleration: emptyIntensityKindCounts(),
      drivingExposure: emptyExposure,
      eventIntensityRecords: [],
      usableTemporalCoverage: { labelCount: 0, directFsmLabelCount: 0, speedNumericCount: 0 },
    };
  }
  const raw = json as Record<string, unknown>;
  const exposureRaw = raw.drivingExposure;
  let drivingExposure = emptyExposure;
  if (exposureRaw != null && typeof exposureRaw === 'object' && !Array.isArray(exposureRaw)) {
    drivingExposure = { ...emptyExposure, ...(exposureRaw as Ds4DrivingExposureV1) };
  }
  const recordsRaw = raw.eventIntensityRecords;
  const eventIntensityRecords = Array.isArray(recordsRaw)
    ? (recordsRaw as Ds4EventIntensityEligibilityRecordV1[])
    : [];
  return {
    acceptedAccelerationCount: typeof raw.acceptedAccelerationCount === 'number' ? raw.acceptedAccelerationCount : 0,
    acceptedDecelerationCount: typeof raw.acceptedDecelerationCount === 'number' ? raw.acceptedDecelerationCount : 0,
    artefactSuspectCount: typeof raw.artefactSuspectCount === 'number' ? raw.artefactSuspectCount : 0,
    ratedEventCount: typeof raw.ratedEventCount === 'number' ? raw.ratedEventCount : 0,
    unratedEventCount: typeof raw.unratedEventCount === 'number' ? raw.unratedEventCount : 0,
    accelerationOrdinalValues: Array.isArray(raw.accelerationOrdinalValues)
      ? (raw.accelerationOrdinalValues as number[])
      : [],
    decelerationOrdinalValues: Array.isArray(raw.decelerationOrdinalValues)
      ? (raw.decelerationOrdinalValues as number[])
      : [],
    intensityAcceleration: emptyIntensityKindCounts(),
    intensityDeceleration: emptyIntensityKindCounts(),
    drivingExposure,
    eventIntensityRecords,
    usableTemporalCoverage: { labelCount: 0, directFsmLabelCount: 0, speedNumericCount: 0 },
  };
}

export function computeDs4LongitudinalLoadObservablesV1(
  input: Ds4LongitudinalLoadObservablesInputV1,
): Ds4LongitudinalLoadObservablesV1 {
  const reasonCodes: Ds4LongitudinalLoadReasonCodeV1[] = [];
  const exposure = input.drivingExposure;

  const records = [...input.eventIntensityRecords].sort((a, b) => a.eventIndex - b.eventIndex);

  const recordError = validateRecords(records);
  if (recordError) {
    return {
      modelVersion: DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1,
      exposureGate: DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED,
      speedAuthority: input.speedAuthority,
      exposureSeconds: null,
      distanceKm: null,
      meanMovingSpeedKmh: null,
      exposureCoverageRatio: null,
      reasonCodes: [recordError],
      collectionComplete: false,
      acceleration: emptyKindObservables(),
      deceleration: emptyKindObservables(),
    };
  }

  const actualAdmissible = records.filter(isAdmissibleRecord).length;
  const collectionComplete = actualAdmissible === input.ratedEventCount;
  if (!collectionComplete) {
    reasonCodes.push('COLLECTION_INCOMPLETE');
  }

  if (input.evidenceQuality !== 'PRESENT') {
    reasonCodes.push('EVIDENCE_QUALITY_NOT_PRESENT');
    for (const code of input.longitudinalEvidenceSupplementaryReasonCodes ?? []) {
      if (!reasonCodes.includes(code)) reasonCodes.push(code);
    }
    return failResult(input, reasonCodes, collectionComplete);
  }

  if (!DS4_LONGITUDINAL_LOAD_ELIGIBLE_ASSESSMENT_STATUSES_V1.includes(input.assessmentStatus)) {
    reasonCodes.push('ASSESSMENT_STATUS_NOT_ELIGIBLE');
    return failResult(input, reasonCodes, collectionComplete);
  }

  if (!exposure.derivable) {
    reasonCodes.push('DRIVING_EXPOSURE_NOT_DERIVABLE');
    return failResult(input, reasonCodes, collectionComplete);
  }

  const eS = exposure.exposureSeconds;
  const dKm = exposure.distanceKm;
  if (!isFinitePositive(eS)) {
    reasonCodes.push('EXPOSURE_SECONDS_INVALID');
    return failResult(input, reasonCodes, collectionComplete);
  }

  if (!isFiniteNonNegative(dKm)) {
    reasonCodes.push('DISTANCE_KM_INVALID');
    return failResult(input, reasonCodes, collectionComplete);
  }

  const prov = exposure.provenance;
  let coverageRatio: number | null = null;
  if (prov.fsmMovingDirectLabelCount > 0 && Number.isFinite(prov.qualifyingIntervalCount)) {
    coverageRatio = prov.qualifyingIntervalCount / prov.fsmMovingDirectLabelCount;
    if (!Number.isFinite(coverageRatio)) coverageRatio = null;
  }

  const excludedCount = input.unratedEventCount + input.artefactSuspectCount;
  const tripLevelZeroLoadValid = actualAdmissible === 0 && excludedCount === 0 && collectionComplete;
  if (actualAdmissible === 0 && excludedCount > 0) {
    reasonCodes.push('ZERO_ADMISSIBLE_WITH_EXCLUDED_EVENTS');
  }

  const tripBlocked = reasonCodes.some((c) => {
    if (c === 'COLLECTION_INCOMPLETE') return true;
    return (
      c === 'ZERO_ADMISSIBLE_WITH_EXCLUDED_EVENTS' ||
      c === 'EVIDENCE_QUALITY_NOT_PRESENT' ||
      c === 'ASSESSMENT_STATUS_NOT_ELIGIBLE' ||
      c === 'DRIVING_EXPOSURE_NOT_DERIVABLE' ||
      c === 'EXPOSURE_SECONDS_INVALID' ||
      c === 'DISTANCE_KM_INVALID'
    );
  });

  const canComputeMetrics = !tripBlocked;

  const accelAcc = accumulateKind(records.filter((r) => kindBucket(r) === 'acceleration'));
  const decelAcc = accumulateKind(records.filter((r) => kindBucket(r) === 'deceleration'));

  const accelZeroLoadValid = isKindZeroLoadValidV1({
    kindAdmissibleCount: accelAcc.admissible.length,
    kindNonAdmissibleCount: countKindNonAdmissibleRecords(records, 'acceleration'),
    collectionComplete,
    canComputeMetrics,
    tripLevelZeroLoadValid,
    tripAdmissibleCount: actualAdmissible,
  });
  const decelZeroLoadValid = isKindZeroLoadValidV1({
    kindAdmissibleCount: decelAcc.admissible.length,
    kindNonAdmissibleCount: countKindNonAdmissibleRecords(records, 'deceleration'),
    collectionComplete,
    canComputeMetrics,
    tripLevelZeroLoadValid,
    tripAdmissibleCount: actualAdmissible,
  });

  return {
    modelVersion: DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1,
    exposureGate: DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED,
    speedAuthority: input.speedAuthority,
    exposureSeconds: eS,
    distanceKm: dKm,
    meanMovingSpeedKmh: canComputeMetrics && dKm > 0 ? roundDisplay((3600 * dKm) / eS, 6) : null,
    exposureCoverageRatio: coverageRatio == null ? null : roundDisplay(coverageRatio, 6),
    reasonCodes,
    collectionComplete,
    acceleration: computeKindMetrics(accelAcc, eS, dKm, canComputeMetrics, accelZeroLoadValid),
    deceleration: computeKindMetrics(decelAcc, eS, dKm, canComputeMetrics, decelZeroLoadValid),
  };
}

function failResult(
  input: Ds4LongitudinalLoadObservablesInputV1,
  reasonCodes: Ds4LongitudinalLoadReasonCodeV1[],
  collectionComplete: boolean,
): Ds4LongitudinalLoadObservablesV1 {
  return {
    modelVersion: DS4_LONGITUDINAL_LOAD_OBSERVABLES_MODEL_VERSION_V1,
    exposureGate: DS4_LONGITUDINAL_LOAD_EXPOSURE_GATE_UNCALIBRATED,
    speedAuthority: input.speedAuthority,
    exposureSeconds: null,
    distanceKm: null,
    meanMovingSpeedKmh: null,
    exposureCoverageRatio: null,
    reasonCodes,
    collectionComplete,
    acceleration: emptyKindObservables(),
    deceleration: emptyKindObservables(),
  };
}
