import { MOTION_EVENT_HF_THRESHOLDS_V1 } from './motion-event-detector';
import type { MotionManoeuvreEvent } from './motion-event.types';
import type { MotionCoreSpeedSample } from './speed-sample.types';

/**
 * Reuses Speed QC / shadow semantics as sample flags (no parallel quality engine).
 * @see evaluate-di-v0-speed-qc-interval.ts (CROSS_SOURCE_CONFLICT, SHADOW_ABSTAINED)
 */
export const MOTION_INTENSITY_UNTRUSTED_ENDPOINT_FLAG_MARKERS = [
  'CROSS_SOURCE_CONFLICT',
  'SHADOW_ABSTAINED',
  'SPEED_EVIDENCE_ABSTAINED',
  'SPEED_EVIDENCE_CONFLICT_EXPLAINED',
  'SPEED_QC_UNTRUSTED',
] as const;

export type MotionIntensityEndpointUntrustedReasonV1 =
  | 'START_ENDPOINT_UNTRUSTED'
  | 'END_ENDPOINT_UNTRUSTED';

export function isMotionCoreSpeedSampleTrustedForIntensityEndpoint(
  sample: MotionCoreSpeedSample | undefined,
): boolean {
  if (sample == null || sample.valueKmh == null) {
    return false;
  }
  for (const flag of sample.flags) {
    if (MOTION_INTENSITY_UNTRUSTED_ENDPOINT_FLAG_MARKERS.some((m) => flag === m || flag.startsWith(`${m}=`))) {
      return false;
    }
  }
  return true;
}

/**
 * Fail closed on intensity consumption when either endpoint speed is not evidence-trusted.
 * Preserves event row and diagnostic flags; does not zero kinematic fields.
 */
export function applyMotionEventIntensityEndpointEvidenceGate(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
): void {
  const byLabel = new Map(samples.map((s) => [s.label, s]));
  for (const ev of events) {
    if (ev.quality === 'ARTEFACT_SUSPECT') {
      continue;
    }
    const reasons: MotionIntensityEndpointUntrustedReasonV1[] = [];
    if (!isMotionCoreSpeedSampleTrustedForIntensityEndpoint(byLabel.get(ev.startLabel))) {
      reasons.push('START_ENDPOINT_UNTRUSTED');
    }
    if (!isMotionCoreSpeedSampleTrustedForIntensityEndpoint(byLabel.get(ev.endLabel))) {
      reasons.push('END_ENDPOINT_UNTRUSTED');
    }
    if (reasons.length === 0) {
      continue;
    }
    ev.quality = 'ARTEFACT_SUSPECT';
    ev.flags = [...ev.flags, `INTENSITY_ENDPOINT_EVIDENCE=${reasons.join(',')}`].sort();
  }
}

function sortedNumericSamples(samples: readonly MotionCoreSpeedSample[]): MotionCoreSpeedSample[] {
  return samples
    .filter((s) => s.valueKmh != null)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Opposite-kind events that share a label with a local speed spike (conflict knot) are not
 * intensity-trustworthy — spike bracket may skip them when oppositeFollows is true.
 */
export function isSharedConflictKnotSample(
  knot: MotionCoreSpeedSample,
  prev: MotionCoreSpeedSample | null,
  next: MotionCoreSpeedSample | null,
): boolean {
  if (knot.valueKmh == null || prev?.valueKmh == null || next?.valueKmh == null) {
    return false;
  }
  const k = knot.valueKmh;
  const p = prev.valueKmh;
  const n = next.valueKmh;
  const neighborHigh = Math.max(p, n);
  const neighborLow = Math.max(Math.min(p, n), 1);
  const minSpikeKmh = MOTION_EVENT_HF_THRESHOLDS_V1.minDeltaKmh.ACCELERATION * 3;
  if (k - neighborHigh < minSpikeKmh) {
    return false;
  }
  if (k / neighborLow < 2.5) {
    return false;
  }
  return true;
}

/** Max |startSpeed − endSpeed| for ACCEL/DECEL pair corridor coherence (km/h). */
export const SHARED_KNOT_SPIKE_PAIR_CORRIDOR_TOL_KMH_V1 = 5;

export type MotionEventIntensityEvidenceGateOptionsV1 = {
  /** C5.1 repair Q5/Q6 evidence keyed by bucket label; omit on C4-only paths. */
  c51RepairEvidence?: ReadonlyArray<{
    bucketLabelUtc: string;
    q5Evidence: string | null;
    q6Evidence: string | null;
  }>;
};

export type SharedKnotSpikePairIndicatorAssessmentV1 = {
  classicSharedConflictKnot: boolean;
  /** Plateau spike: corridor endpoints coherent + knot excursion + rapid in/out legs. */
  physicsCorridorSpikeReversion: boolean;
  c51Q5Q6Violation: boolean;
  /** Independent indicator count (geometry buckets + C5.1; see assessSharedKnotSpikePairIndicatorsV1). */
  independentIndicatorCount: number;
  confirmedArtefactPair: boolean;
};

/**
 * Indicator independence:
 * - `classicSharedConflictKnot` and `physicsCorridorSpikeReversion` are mutually exclusive geometry buckets
 *   (isolated ±1 spike ratio vs plateau corridor contradiction); at most one counts toward the threshold.
 * - `c51Q5Q6Violation` uses repair metadata only and is independent of geometry buckets.
 * Confirmed artefact requires ≥2 independent indicators and complete knot ±1 speed samples.
 */
export function assessSharedKnotSpikePairIndicatorsV1(input: {
  accel: MotionManoeuvreEvent;
  decel: MotionManoeuvreEvent;
  knot: MotionCoreSpeedSample;
  prev: MotionCoreSpeedSample;
  next: MotionCoreSpeedSample;
  c51RepairEvidence?: ReadonlyMap<string, { q5: string | null; q6: string | null }>;
}): SharedKnotSpikePairIndicatorAssessmentV1 {
  const classicSharedConflictKnot = isSharedConflictKnotSample(input.knot, input.prev, input.next);

  const corridorCoherent =
    Math.abs(input.accel.startSpeedKmh - input.decel.endSpeedKmh) <= SHARED_KNOT_SPIKE_PAIR_CORRIDOR_TOL_KMH_V1;
  const minSpikeKmh = MOTION_EVENT_HF_THRESHOLDS_V1.minDeltaKmh.ACCELERATION * 3;
  const corridorHigh = Math.max(input.accel.startSpeedKmh, input.decel.endSpeedKmh);
  const knotExcursion =
    input.knot.valueKmh != null && input.knot.valueKmh - corridorHigh >= minSpikeKmh;

  const dtIn = 1;
  const dtOut = 1;
  const continue2x = MOTION_EVENT_HF_THRESHOLDS_V1.continueMps2 * 2;
  const rapidIn =
    input.prev.valueKmh != null &&
    input.knot.valueKmh != null &&
    Math.abs((input.knot.valueKmh - input.prev.valueKmh) / 3.6 / dtIn) >= continue2x;
  const rapidOut =
    input.next.valueKmh != null &&
    input.knot.valueKmh != null &&
    Math.abs((input.next.valueKmh - input.knot.valueKmh) / 3.6 / dtOut) >= continue2x;

  const physicsCorridorSpikeReversion =
    corridorCoherent && knotExcursion && rapidIn && rapidOut && !classicSharedConflictKnot;

  const repair = input.c51RepairEvidence?.get(input.knot.label);
  const c51Q5Q6Violation =
    repair != null && (repair.q5 === 'VIOLATION' || repair.q6 === 'VIOLATION');

  const geometryCount = classicSharedConflictKnot ? 1 : physicsCorridorSpikeReversion ? 1 : 0;
  const independentIndicatorCount = geometryCount + (c51Q5Q6Violation ? 1 : 0);

  return {
    classicSharedConflictKnot,
    physicsCorridorSpikeReversion,
    c51Q5Q6Violation,
    independentIndicatorCount,
    confirmedArtefactPair: independentIndicatorCount >= 2,
  };
}

function buildC51RepairMap(
  rows: MotionEventIntensityEvidenceGateOptionsV1['c51RepairEvidence'],
): Map<string, { q5: string | null; q6: string | null }> | undefined {
  if (rows == null || rows.length === 0) {
    return undefined;
  }
  const map = new Map<string, { q5: string | null; q6: string | null }>();
  for (const row of rows) {
    map.set(row.bucketLabelUtc, { q5: row.q5Evidence, q6: row.q6Evidence });
  }
  return map;
}

/**
 * Conservative shared-knot spike pair gate for adjacent ACCEL→DECEL secants that share a knot label.
 * Does not remove events; sets quality ARTEFACT_SUSPECT when multi-indicator evidence confirms artefact.
 */
export function applyMotionEventSharedKnotSpikePairGate(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
  options?: MotionEventIntensityEvidenceGateOptionsV1,
): void {
  const ordered = sortedNumericSamples(samples);
  const indexByLabel = new Map(ordered.map((s, i) => [s.label, i]));
  const c51Map = buildC51RepairMap(options?.c51RepairEvidence);

  for (let i = 0; i < events.length; i++) {
    for (let j = 0; j < events.length; j++) {
      if (i === j) {
        continue;
      }
      const accel = events[i]!;
      const decel = events[j]!;
      if (
        accel.kind !== 'ACCELERATION' ||
        decel.kind !== 'DECELERATION' ||
        accel.endLabel !== decel.startLabel
      ) {
        continue;
      }

      const ki = indexByLabel.get(accel.endLabel);
      if (ki == null || ki < 1 || ki >= ordered.length - 1) {
        continue;
      }

      const knot = ordered[ki]!;
      const prev = ordered[ki - 1]!;
      const next = ordered[ki + 1]!;
      if (knot.valueKmh == null || prev.valueKmh == null || next.valueKmh == null) {
        continue;
      }

      const assessment = assessSharedKnotSpikePairIndicatorsV1({
        accel,
        decel,
        knot,
        prev,
        next,
        c51RepairEvidence: c51Map,
      });
      if (!assessment.confirmedArtefactPair) {
        continue;
      }

      const geometryFlag = assessment.classicSharedConflictKnot
        ? 'classic'
        : assessment.physicsCorridorSpikeReversion
          ? 'corridor'
          : 'none';
      const c51Flag = assessment.c51Q5Q6Violation ? 'Q5_Q6_VIOLATION' : 'none';
      const knotKmh = Math.round(knot.valueKmh * 10) / 10;
      const flag = `SHARED_KNOT_SPIKE_PAIR=${knot.label};knot_kmh:${knotKmh};geometry:${geometryFlag};c51:${c51Flag};ind:${assessment.independentIndicatorCount}`;

      for (const ev of [accel, decel]) {
        if (!ev.flags.some((f) => f.startsWith('SHARED_KNOT_SPIKE_PAIR='))) {
          ev.flags = [...ev.flags, flag].sort();
        }
        if (ev.quality === 'ARTEFACT_SUSPECT') {
          continue;
        }
        ev.quality = 'ARTEFACT_SUSPECT';
      }
    }
  }
}

export function applyMotionEventSharedConflictKnotGate(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
): void {
  const ordered = sortedNumericSamples(samples);
  const indexByLabel = new Map(ordered.map((s, i) => [s.label, i]));

  for (let i = 0; i < events.length; i++) {
    for (let j = 0; j < events.length; j++) {
      if (i === j) {
        continue;
      }
      const a = events[i]!;
      const b = events[j]!;
      if (a.kind === b.kind || a.endLabel !== b.startLabel) {
        continue;
      }
      const ki = indexByLabel.get(a.endLabel);
      if (ki == null || ki < 1 || ki >= ordered.length - 1) {
        continue;
      }
      const knot = ordered[ki]!;
      const prev = ordered[ki - 1]!;
      const next = ordered[ki + 1]!;
      if (!isSharedConflictKnotSample(knot, prev, next)) {
        continue;
      }
      for (const ev of [a, b]) {
        const knotFlag = `SHARED_CONFLICT_KNOT=${knot.label};knot_kmh:${Math.round(knot.valueKmh! * 10) / 10}`;
        if (!ev.flags.some((f) => f.startsWith('SHARED_CONFLICT_KNOT'))) {
          ev.flags = [...ev.flags, knotFlag].sort();
        }
        if (ev.quality === 'ARTEFACT_SUSPECT') {
          continue;
        }
        ev.quality = 'ARTEFACT_SUSPECT';
      }
    }
  }
}

/** Production shadow stack: endpoint trust + shared knot gates after universal plausibility. */
export function applyMotionEventIntensityEvidenceGatesV1(
  events: MotionManoeuvreEvent[],
  samples: readonly MotionCoreSpeedSample[],
  options?: MotionEventIntensityEvidenceGateOptionsV1,
): void {
  applyMotionEventIntensityEndpointEvidenceGate(events, samples);
  applyMotionEventSharedConflictKnotGate(events, samples);
  applyMotionEventSharedKnotSpikePairGate(events, samples, options);
}
