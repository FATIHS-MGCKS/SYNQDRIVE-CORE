import { emptyDs4DrivingExposureV1, type Ds4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import type { Ds4LongitudinalLoadObservablesInputV1 } from '../ds4-longitudinal-load-observables.v1.contract';
import {
  computeDs4LongitudinalLoadObservablesV1,
  percentileLinearInclusiveSorted,
} from '../ds4-longitudinal-load-observables.v1';

function admissibleRecord(
  overrides: Partial<Ds4EventIntensityEligibilityRecordV1> & Pick<Ds4EventIntensityEligibilityRecordV1, 'eventIndex' | 'kind'>,
): Ds4EventIntensityEligibilityRecordV1 {
  const classification = overrides.classification ?? 'ADMISSIBLE_FULL';
  const durationS = overrides.durationS ?? 3;
  return {
    classification,
    durationTier: classification === 'ADMISSIBLE_FULL' ? 'FULL_ELIGIBLE' : 'BIN_ONLY',
    eventQuality: 'OK',
    speedAuthority: 'C4_ONLY',
    meanAccelMps2: overrides.meanAccelMps2 ?? 1.5,
    durationS,
    steps: overrides.steps ?? durationS,
    coverageRatio: overrides.coverageRatio ?? 1,
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
    reasonCodes: ['EVENT_ADMISSIBLE_FULL_ELIGIBLE'],
    startLabel: '2026-01-01T10:00:00Z',
    endLabel: '2026-01-01T10:00:03Z',
    ...overrides,
  };
}

function exposure(overrides: { exposureSeconds?: number; distanceKm?: number; derivable?: boolean } = {}): Ds4DrivingExposureV1 {
  const base = emptyDs4DrivingExposureV1('C4_ONLY');
  const exposureSeconds = overrides.exposureSeconds ?? 1200;
  const distanceKm = overrides.distanceKm ?? 15;
  return {
    ...base,
    derivable: overrides.derivable ?? true,
    exposureSeconds,
    distanceKm,
    provenance: {
      ...base.provenance,
      speedAuthority: 'C4_ONLY',
      qualifyingIntervalCount: exposureSeconds,
      fsmMovingDirectLabelCount: exposureSeconds,
    },
  };
}

function baseInput(overrides: Partial<Ds4LongitudinalLoadObservablesInputV1> = {}): Ds4LongitudinalLoadObservablesInputV1 {
  const records = overrides.eventIntensityRecords ?? [];
  const rated = records.filter((r) => r.classification.startsWith('ADMISSIBLE')).length;
  return {
    assessmentStatus: 'UNRATED_COUNTS_ONLY',
    evidenceQuality: 'PRESENT',
    speedAuthority: 'C4_ONLY',
    ratedEventCount: rated,
    unratedEventCount: 0,
    artefactSuspectCount: 0,
    drivingExposure: exposure(),
    eventIntensityRecords: records,
    ...overrides,
  };
}

describe('percentileLinearInclusiveSorted', () => {
  it('uses linear interpolation between closest ranks (PERCENTILE.INC)', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileLinearInclusiveSorted(sorted, 0.9)).toBeCloseTo(9.1, 10);
    expect(percentileLinearInclusiveSorted(sorted, 0.5)).toBeCloseTo(5.5, 10);
  });
});

describe('computeDs4LongitudinalLoadObservablesV1', () => {
  it('V1 — single strong FULL deceleration event', () => {
    const input = baseInput({
      eventIntensityRecords: [
        admissibleRecord({
          eventIndex: 0,
          kind: 'DECELERATION',
          meanAccelMps2: 3,
          durationS: 3,
          classification: 'ADMISSIBLE_FULL',
        }),
      ],
      drivingExposure: exposure({ exposureSeconds: 1200, distanceKm: 20 }),
    });
    const out = computeDs4LongitudinalLoadObservablesV1(input);
    expect(out.exposureGate).toBe('UNCALIBRATED');
    expect(out.deceleration.specificLongitudinalImpulseMps).toBe(9);
    expect(out.deceleration.normalizedMeanAccelMps2).toBeCloseTo(9 / 1200, 6);
    expect(out.deceleration.eventFrequencyPerMinute).toBeCloseTo(60 / 1200, 6);
    expect(out.deceleration.intensityMaxAdmissibleMps2).toBe(3);
    expect(out.deceleration.intensityP90FullMps2).toBeNull();
    expect(out.deceleration.impulseSemantics).toBe('SPECIFIC_LONGITUDINAL_IMPULSE_MPS');
  });

  it('V2 — repeated moderate events scale linearly in B and Phi', () => {
    const records = Array.from({ length: 12 }, (_, i) =>
      admissibleRecord({
        eventIndex: i,
        kind: 'ACCELERATION',
        meanAccelMps2: 1.8,
        durationS: 2,
        classification: 'ADMISSIBLE_BIN_ONLY',
      }),
    );
    const input = baseInput({
      eventIntensityRecords: records,
      drivingExposure: exposure({ exposureSeconds: 600, distanceKm: 10 }),
    });
    const out = computeDs4LongitudinalLoadObservablesV1(input);
    expect(out.acceleration.specificLongitudinalImpulseMps).toBeCloseTo(12 * 1.8 * 2, 6);
    expect(out.acceleration.eventFrequencyPerMinute).toBeCloseTo((60 * 12) / 600, 6);
    expect(out.acceleration.intensityMedianFullMps2).toBeNull();
  });

  it('V3 — long highway trip: low I and Phi with few events', () => {
    const input = baseInput({
      eventIntensityRecords: [
        admissibleRecord({ eventIndex: 0, kind: 'DECELERATION', meanAccelMps2: 1.6, durationS: 3 }),
      ],
      drivingExposure: exposure({ exposureSeconds: 3600, distanceKm: 100 }),
    });
    const out = computeDs4LongitudinalLoadObservablesV1(input);
    expect(out.deceleration.normalizedMeanAccelMps2).toBeCloseTo(4.8 / 3600, 6);
    expect(out.deceleration.eventFrequencyPerMinute).toBeCloseTo(60 / 3600, 6);
  });

  it('V4 — short urban trip still computes when exposure valid', () => {
    const input = baseInput({
      eventIntensityRecords: [
        admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', meanAccelMps2: 2, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' }),
        admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 2.2, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' }),
      ],
      drivingExposure: exposure({ exposureSeconds: 300, distanceKm: 3 }),
    });
    const out = computeDs4LongitudinalLoadObservablesV1(input);
    expect(out.exposureSeconds).toBe(300);
    expect(out.acceleration.admissibleEventCount).toBe(1);
    expect(out.deceleration.admissibleEventCount).toBe(1);
  });

  it('V5 — stop-and-go: metrics depend only on admissible events and E_s (fixture-level)', () => {
    const records = [
      admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', meanAccelMps2: 1.5, durationS: 3 }),
      admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 1.7, durationS: 3 }),
    ];
    const e1 = computeDs4LongitudinalLoadObservablesV1(
      baseInput({ eventIntensityRecords: records, drivingExposure: exposure({ exposureSeconds: 900, distanceKm: 8 }) }),
    );
    const e2 = computeDs4LongitudinalLoadObservablesV1(
      baseInput({ eventIntensityRecords: records, drivingExposure: exposure({ exposureSeconds: 900, distanceKm: 8 }) }),
    );
    expect(e2.acceleration).toEqual(e1.acceleration);
    expect(e2.deceleration).toEqual(e1.deceleration);
  });

  it('V6 — missing GPS intervals: fails closed when exposure not derivable', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        eventIntensityRecords: [admissibleRecord({ eventIndex: 0, kind: 'DECELERATION' })],
        drivingExposure: exposure({ derivable: false, exposureSeconds: 0 }),
      }),
    );
    expect(out.reasonCodes).toContain('DRIVING_EXPOSURE_NOT_DERIVABLE');
    expect(out.deceleration.normalizedMeanAccelMps2).toBeNull();
  });

  it('V7 — speed authority preserved (C5.1 vs C4) without pooling', () => {
    const outC5 = computeDs4LongitudinalLoadObservablesV1(baseInput({ speedAuthority: 'C5_1_PREFERRED' }));
    const outC4 = computeDs4LongitudinalLoadObservablesV1(baseInput({ speedAuthority: 'C4_ONLY' }));
    expect(outC5.speedAuthority).toBe('C5_1_PREFERRED');
    expect(outC4.speedAuthority).toBe('C4_ONLY');
  });

  it('V8 — non-admissible events excluded from sums (cadence / eligibility already enforced upstream)', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        ratedEventCount: 1,
        unratedEventCount: 1,
        eventIntensityRecords: [
          admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', meanAccelMps2: 2, durationS: 3 }),
          {
            ...admissibleRecord({ eventIndex: 1, kind: 'ACCELERATION', meanAccelMps2: 9, durationS: 3 }),
            classification: 'UNRATED',
            durationTier: 'UNRATED',
            reasonCodes: ['EVENT_STEPS_DURATION_MISMATCH'],
          },
        ],
      }),
    );
    expect(out.acceleration.specificLongitudinalImpulseMps).toBe(6);
    expect(out.acceleration.admissibleEventCount).toBe(1);
  });

  it('V9 — identical manoeuvre records produce identical metrics regardless of vehicle context (input-only)', () => {
    const records = [admissibleRecord({ eventIndex: 0, kind: 'DECELERATION', meanAccelMps2: 1.77, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' })];
    const a = computeDs4LongitudinalLoadObservablesV1(baseInput({ eventIntensityRecords: records }));
    const b = computeDs4LongitudinalLoadObservablesV1(baseInput({ eventIntensityRecords: records, speedAuthority: 'C5_1_PREFERRED' }));
    expect(a.deceleration.specificLongitudinalImpulseMps).toBe(b.deceleration.specificLongitudinalImpulseMps);
  });

  it('V10 — duration/steps mismatch marked UNRATED does not enter admissible sums', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        ratedEventCount: 1,
        unratedEventCount: 1,
        eventIntensityRecords: [
          admissibleRecord({ eventIndex: 0, kind: 'DECELERATION', meanAccelMps2: 2, durationS: 3 }),
          {
            ...admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 2.17, durationS: 5, steps: 5 }),
            classification: 'UNRATED',
            durationTier: 'UNRATED',
            reasonCodes: ['EVENT_STEPS_DURATION_MISMATCH'],
          },
        ],
      }),
    );
    expect(out.deceleration.admissibleEventCount).toBe(1);
    expect(out.deceleration.specificLongitudinalImpulseMps).toBe(6);
  });

  it('returns valid zero load when no admissible events and no exclusions', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({ eventIntensityRecords: [], ratedEventCount: 0, drivingExposure: exposure({ exposureSeconds: 600, distanceKm: 5 }) }),
    );
    expect(out.acceleration.specificLongitudinalImpulseMps).toBe(0);
    expect(out.acceleration.normalizedMeanAccelMps2).toBe(0);
    expect(out.acceleration.intensityMaxAdmissibleMps2).toBeNull();
  });

  it('P4E A2 — kind-scoped zero load when other kind has admissible events (Tiguan c0448fea pattern)', () => {
    const records = [
      admissibleRecord({ eventIndex: 0, kind: 'DECELERATION', meanAccelMps2: 1.654, durationS: 3, classification: 'ADMISSIBLE_FULL' }),
      admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 1.619, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' }),
      admissibleRecord({ eventIndex: 2, kind: 'DECELERATION', meanAccelMps2: 1.436, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' }),
    ];
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        ratedEventCount: 3,
        eventIntensityRecords: records,
        drivingExposure: exposure({ exposureSeconds: 255, distanceKm: 2.299643177374085 }),
      }),
    );
    expect(out.acceleration.admissibleEventCount).toBe(0);
    expect(out.acceleration.specificLongitudinalImpulseMps).toBe(0);
    expect(out.acceleration.normalizedMeanAccelMps2).toBe(0);
    expect(out.acceleration.eventFrequencyPerMinute).toBe(0);
    expect(out.acceleration.maneuverTimeShare).toBe(0);
    expect(out.acceleration.impulseSemantics).toBe('SPECIFIC_LONGITUDINAL_IMPULSE_MPS');
    expect(out.deceleration.admissibleEventCount).toBe(3);
    expect(out.deceleration.specificLongitudinalImpulseMps).toBeCloseTo(11.072, 3);
  });

  it('P4E A2 — kind-scoped zero load for braking-only-absent kind (Tesla dfc7c443 pattern)', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        ratedEventCount: 1,
        eventIntensityRecords: [
          admissibleRecord({ eventIndex: 2, kind: 'ACCELERATION', meanAccelMps2: 1.636, durationS: 3, classification: 'ADMISSIBLE_FULL' }),
        ],
        drivingExposure: exposure({ exposureSeconds: 188, distanceKm: 1.4482014138231247 }),
      }),
    );
    expect(out.deceleration.admissibleEventCount).toBe(0);
    expect(out.deceleration.specificLongitudinalImpulseMps).toBe(0);
    expect(out.deceleration.normalizedMeanAccelMps2).toBe(0);
    expect(out.deceleration.eventFrequencyPerMinute).toBe(0);
    expect(out.deceleration.maneuverTimeShare).toBe(0);
    expect(out.acceleration.specificLongitudinalImpulseMps).toBeCloseTo(4.908, 3);
  });

  it('P4E A2 — UNRATED events of a kind block zero-load for that kind (negative control)', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        ratedEventCount: 1,
        unratedEventCount: 1,
        eventIntensityRecords: [
          admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', meanAccelMps2: 1.6, durationS: 3 }),
          {
            ...admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 2.5, durationS: 3 }),
            classification: 'UNRATED',
            durationTier: 'UNRATED',
            reasonCodes: ['EVENT_QUALITY_NOT_OK'],
          },
        ],
      }),
    );
    expect(out.acceleration.admissibleEventCount).toBe(1);
    expect(out.deceleration.admissibleEventCount).toBe(0);
    expect(out.deceleration.specificLongitudinalImpulseMps).toBeNull();
    expect(out.deceleration.impulseSemantics).toBe('UNAVAILABLE');
  });

  it('P4E A2 — insufficient exposure still fails closed (negative control)', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        eventIntensityRecords: [admissibleRecord({ eventIndex: 0, kind: 'DECELERATION' })],
        drivingExposure: exposure({ derivable: false, exposureSeconds: 0 }),
      }),
    );
    expect(out.reasonCodes).toContain('DRIVING_EXPOSURE_NOT_DERIVABLE');
    expect(out.acceleration.specificLongitudinalImpulseMps).toBeNull();
    expect(out.deceleration.specificLongitudinalImpulseMps).toBeNull();
  });

  it('nulls metrics when only excluded events exist', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        ratedEventCount: 0,
        unratedEventCount: 1,
        eventIntensityRecords: [
          {
            ...admissibleRecord({ eventIndex: 0, kind: 'DECELERATION' }),
            classification: 'UNRATED',
            durationTier: 'UNRATED',
          },
        ],
      }),
    );
    expect(out.reasonCodes).toContain('ZERO_ADMISSIBLE_WITH_EXCLUDED_EVENTS');
    expect(out.deceleration.specificLongitudinalImpulseMps).toBeNull();
  });

  it('p50 requires >=3 FULL events; p90 requires >=10 FULL events', () => {
    const full = (i: number) =>
      admissibleRecord({ eventIndex: i, kind: 'DECELERATION', meanAccelMps2: 1 + i * 0.1, durationS: 3, classification: 'ADMISSIBLE_FULL' });
    const three = computeDs4LongitudinalLoadObservablesV1(baseInput({ eventIntensityRecords: [full(0), full(1), full(2)] }));
    expect(three.deceleration.intensityMedianFullMps2).not.toBeNull();
    expect(three.deceleration.intensityP90FullMps2).toBeNull();

    const ten = computeDs4LongitudinalLoadObservablesV1(
      baseInput({ eventIntensityRecords: Array.from({ length: 10 }, (_, i) => full(i)) }),
    );
    expect(ten.deceleration.intensityP90FullMps2).not.toBeNull();
  });

  it('Phi_d null when distance is zero', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        eventIntensityRecords: [admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', durationS: 3 })],
        drivingExposure: exposure({ exposureSeconds: 100, distanceKm: 0 }),
      }),
    );
    expect(out.acceleration.eventFrequencyPerKm).toBeNull();
    expect(out.acceleration.eventFrequencyPerMinute).not.toBeNull();
  });

  it('fail-closed on non-finite admissible intensity', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        eventIntensityRecords: [
          admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', meanAccelMps2: Number.NaN, durationS: 3 }),
        ],
      }),
    );
    expect(out.reasonCodes).toContain('NON_FINITE_INPUT');
  });

  it('fail-closed on duplicate eventIndex', () => {
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        eventIntensityRecords: [
          admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION' }),
          admissibleRecord({ eventIndex: 0, kind: 'DECELERATION' }),
        ],
      }),
    );
    expect(out.reasonCodes).toContain('DUPLICATE_EVENT_INDEX');
  });

  it('is stable under reordered input events', () => {
    const r0 = admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION', meanAccelMps2: 1.5, durationS: 3 });
    const r1 = admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 2, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' });
    const ordered = computeDs4LongitudinalLoadObservablesV1(baseInput({ eventIntensityRecords: [r0, r1] }));
    const shuffled = computeDs4LongitudinalLoadObservablesV1(baseInput({ eventIntensityRecords: [r1, r0] }));
    expect(shuffled.acceleration).toEqual(ordered.acceleration);
    expect(shuffled.deceleration).toEqual(ordered.deceleration);
  });

  it('does not mutate input records', () => {
    const records = [admissibleRecord({ eventIndex: 0, kind: 'ACCELERATION' })];
    const snapshot = JSON.stringify(records);
    computeDs4LongitudinalLoadObservablesV1(baseInput({ eventIntensityRecords: records }));
    expect(JSON.stringify(records)).toBe(snapshot);
  });

  it('golden — production-scale Tiguan-like aggregates (fixture, not calibration)', () => {
    const decFull = [1.838, 1.886, 1.886, 2.254, 3.135, 1.853, 1.767, 1.767];
    const decBin = [1.772, 1.624, 1.73, 1.615];
    const accFull = [1.561, 1.973, 1.513, 2.254];
    const accBin = [1.621];
    let idx = 0;
    const records: Ds4EventIntensityEligibilityRecordV1[] = [];
    for (const a of decFull) {
      records.push(admissibleRecord({ eventIndex: idx++, kind: 'DECELERATION', meanAccelMps2: a, durationS: 3, classification: 'ADMISSIBLE_FULL' }));
    }
    for (const a of decBin) {
      records.push(
        admissibleRecord({ eventIndex: idx++, kind: 'DECELERATION', meanAccelMps2: a, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' }),
      );
    }
    for (const a of accFull) {
      records.push(admissibleRecord({ eventIndex: idx++, kind: 'ACCELERATION', meanAccelMps2: a, durationS: 3, classification: 'ADMISSIBLE_FULL' }));
    }
    for (const a of accBin) {
      records.push(
        admissibleRecord({ eventIndex: idx++, kind: 'ACCELERATION', meanAccelMps2: a, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY' }),
      );
    }
    const out = computeDs4LongitudinalLoadObservablesV1(
      baseInput({
        speedAuthority: 'C5_1_PREFERRED',
        eventIntensityRecords: records,
        drivingExposure: exposure({ exposureSeconds: 1217, distanceKm: 15.01687038104455 }),
      }),
    );
    expect(out.deceleration.admissibleEventCount).toBe(12);
    expect(out.acceleration.admissibleEventCount).toBe(5);
    let bDec = 0;
    for (const a of decFull) bDec += a * 3;
    for (const a of decBin) bDec += a * 2;
    let bAcc = 0;
    for (const a of accFull) bAcc += a * 3;
    for (const a of accBin) bAcc += a * 2;
    expect(out.deceleration.normalizedMeanAccelMps2).toBeCloseTo(bDec / 1217, 6);
    expect(out.acceleration.normalizedMeanAccelMps2).toBeCloseTo(bAcc / 1217, 6);
    expect(out.deceleration.intensityMedianFullMps2).not.toBeNull();
    expect(out.deceleration.intensityP90FullMps2).toBeNull();
  });
});
