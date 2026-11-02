import type { Ds4Layer2P4bEventSpeedEvidenceRowV1 } from '../research/ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import {
  buildDs4Layer2P4eA5EventConsistencyDiagnosticV1,
  computeDs4Layer2P4eA5EventShapeIndexV1,
  computeDs4Layer2P4eA5SecantAccelMps2V1,
  computeDs4Layer2P4eA6KindTierDecompositionV1,
} from '../research/ds4-layer2-p4e-a5-a6-consistency.v1';
import type { Ds4LongitudinalLoadKindObservablesV1 } from '../ds4-longitudinal-load-observables.v1.contract';

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

function baseEvidence(overrides: Partial<Ds4Layer2P4bEventSpeedEvidenceRowV1>): Ds4Layer2P4bEventSpeedEvidenceRowV1 {
  return {
    offlineReconstructionKey: 'k',
    tripId: 'trip',
    vehicleId: 'v',
    sourceMotionRunId: 'run',
    motionContentFingerprint: 'fp',
    sourceMotionRevision: 'rev',
    eventIndex: 0,
    eventKind: 'ACCELERATION',
    startLabelUtc: '2026-01-01T00:00:00Z',
    endLabelUtc: '2026-01-01T00:00:02Z',
    durationTier: 'FULL_ELIGIBLE',
    eligibilityClassification: 'ADMISSIBLE_FULL',
    p2SpeedAuthority: 'C4_ONLY',
    payloadSpeedAuthority: 'C4_ONLY',
    startSpeedKmh: 50,
    endSpeedKmh: 56,
    boundaryEvidenceClass: 'PERSISTED_BOUNDARY',
    windowMinSpeedKmh: 50,
    windowMaxSpeedKmh: 56,
    windowMeanSpeedKmh: 53,
    windowSampleCount: 2,
    windowExpectedSampleCount: 2,
    windowCoverageRatio: 1,
    windowEvidenceClass: 'DERIVED_IN_WINDOW',
    windowLimitationReasonsJson: '[]',
    repairInfluenced: false,
    peakAccelMps2: null,
    peakEvidenceStatus: 'UNAVAILABLE',
    peakUnavailabilityReason: 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT',
    qualityLimitationReasonsJson: '[]',
    ...overrides,
  };
}

function baseIntensity(overrides: Partial<Ds4EventIntensityEligibilityRecordV1>): Ds4EventIntensityEligibilityRecordV1 {
  return {
    eventIndex: 0,
    kind: 'ACCELERATION',
    classification: 'ADMISSIBLE_FULL',
    durationTier: 'FULL_ELIGIBLE',
    eventQuality: 'OK',
    speedAuthority: 'C4_ONLY',
    meanAccelMps2: 2,
    durationS: 2,
    steps: 2,
    coverageRatio: 1,
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
    reasonCodes: [],
    startLabel: '2026-01-01T00:00:00Z',
    endLabel: '2026-01-01T00:00:02Z',
    ...overrides,
  };
}

describe('ds4-layer2-p4e-a5-a6-consistency.v1', () => {
  it('computes secant acceleration and near-zero impulse residual when mean matches boundary secant', () => {
    const secant = computeDs4Layer2P4eA5SecantAccelMps2V1({
      startSpeedKmh: 50,
      endSpeedKmh: 57.2,
      durationS: 2,
    });
    expect(secant).toBeCloseTo(1, 6);
    const diag = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({ startSpeedKmh: 50, endSpeedKmh: 57.2, windowMeanSpeedKmh: 53.6 }),
      intensity: baseIntensity({ meanAccelMps2: 1, durationS: 2 }),
    });
    expect(diag.secantSupportStatus).toBe('SUPPORTED');
    expect(diag.secantImpulseResidualMps).toBeCloseTo(0, 9);
    expect(diag.speedSupportDurationTier).toBe('FULL_ELIGIBLE');
  });

  it('shape index is zero for linear window mean at chord midpoint', () => {
    const shape = computeDs4Layer2P4eA5EventShapeIndexV1({
      startSpeedKmh: 40,
      endSpeedKmh: 50,
      windowMeanSpeedKmh: 45,
    });
    expect(shape.status).toBe('DEFINED');
    expect(shape.shapeIndex).toBeCloseTo(0, 9);
  });

  it('negative controls: missing boundary, zero duration, missing mean, zero boundary delta', () => {
    const missingBoundary = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({ startSpeedKmh: null, endSpeedKmh: 50 }),
      intensity: baseIntensity({}),
    });
    expect(missingBoundary.secantSupportStatus).toBe('UNAVAILABLE_MISSING_BOUNDARY_SPEED');

    const zeroDuration = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({}),
      intensity: baseIntensity({ durationS: 0 }),
    });
    expect(zeroDuration.secantSupportStatus).toBe('UNAVAILABLE_ZERO_DURATION');

    const missingMean = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({}),
      intensity: baseIntensity({ meanAccelMps2: null }),
    });
    expect(missingMean.secantSupportStatus).toBe('UNAVAILABLE_MISSING_MEAN_ACCEL');

    const unrated = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({ eligibilityClassification: 'UNRATED' }),
      intensity: baseIntensity({ classification: 'UNRATED', meanAccelMps2: null }),
    });
    expect(unrated.meanAccelMps2).toBeNull();

    const flatBoundary = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({ startSpeedKmh: 50, endSpeedKmh: 50, windowMeanSpeedKmh: 50 }),
      intensity: baseIntensity({ meanAccelMps2: 0.1, durationS: 2 }),
    });
    expect(flatBoundary.eventShapeIndexStatus).toBe('UNAVAILABLE_ZERO_BOUNDARY_DELTA');
  });

  it('perturbation: inconsistent boundary profile yields non-zero secant impulse residual', () => {
    const diag = buildDs4Layer2P4eA5EventConsistencyDiagnosticV1({
      evidence: baseEvidence({ startSpeedKmh: 50, endSpeedKmh: 80 }),
      intensity: baseIntensity({ meanAccelMps2: 1, durationS: 2 }),
    });
    expect(diag.secantSupportStatus).toBe('SUPPORTED');
    expect(Math.abs(diag.secantImpulseResidualMps ?? 0)).toBeGreaterThan(0.5);
  });

  it('A6 decomposes B_total into FULL and BIN_ONLY and matches load-model B', () => {
    const records = [
      baseIntensity({ eventIndex: 0, classification: 'ADMISSIBLE_FULL', meanAccelMps2: 2, durationS: 3 }),
      baseIntensity({ eventIndex: 1, classification: 'ADMISSIBLE_BIN_ONLY', meanAccelMps2: 1, durationS: 2, durationTier: 'BIN_ONLY' }),
    ];
    const loadKind = {
      ...emptyKindObservables(),
      admissibleEventCount: 2,
      fullEventCount: 1,
      binOnlyEventCount: 1,
      specificLongitudinalImpulseMps: 8,
      impulseSemantics: 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS' as const,
      normalizedMeanAccelMps2: 0.1,
      maneuverTimeShare: 0.5,
    };
    const a6 = computeDs4Layer2P4eA6KindTierDecompositionV1({
      kind: 'acceleration',
      records,
      loadKindObservables: loadKind,
    });
    expect(a6.bFullMps).toBeCloseTo(6, 6);
    expect(a6.bBinOnlyMps).toBeCloseTo(2, 6);
    expect(a6.bTotalMps).toBeCloseTo(8, 6);
    expect(a6.fullContributionShare).toBeCloseTo(0.75, 6);
    expect(a6.binOnlyContributionShare).toBeCloseTo(0.25, 6);
    expect(a6.bTotalMatchesLoadModelB).toBe(true);
  });

  it('A6 zero-load semantics export explicit zeros without shares', () => {
    const loadKind = {
      ...emptyKindObservables(),
      admissibleEventCount: 0,
      fullEventCount: 0,
      binOnlyEventCount: 0,
      specificLongitudinalImpulseMps: 0,
      impulseSemantics: 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS' as const,
      normalizedMeanAccelMps2: 0,
      maneuverTimeShare: 0,
    };
    const a6 = computeDs4Layer2P4eA6KindTierDecompositionV1({
      kind: 'deceleration',
      records: [],
      loadKindObservables: loadKind,
    });
    expect(a6.tierImpulseSemantics).toBe('ZERO_LOAD');
    expect(a6.bTotalMps).toBe(0);
    expect(a6.fullContributionShare).toBeNull();
  });
});
