import { emptyDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import { computeDs4LongitudinalLoadObservablesV1 } from '../ds4-longitudinal-load-observables.v1';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import {
  buildDs4Layer2P4eA4EvidenceSupportAnnotationV1,
  buildDs4Layer2P4eKindInterpretabilityV1,
  computeDs4Layer2P4eA3IntensityDecompositionV1,
  resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1,
} from '../research/ds4-layer2-p4e-a3-a4-interpretability.v1';

function admissibleRecord(
  overrides: Partial<Ds4EventIntensityEligibilityRecordV1> & Pick<Ds4EventIntensityEligibilityRecordV1, 'eventIndex' | 'kind'>,
): Ds4EventIntensityEligibilityRecordV1 {
  return {
    classification: 'ADMISSIBLE_FULL',
    durationTier: 'FULL_ELIGIBLE',
    eventQuality: 'OK',
    speedAuthority: 'C4_ONLY',
    meanAccelMps2: 1.5,
    durationS: 3,
    steps: 3,
    coverageRatio: 1,
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
    reasonCodes: [],
    startLabel: '2026-01-01T10:00:00Z',
    endLabel: '2026-01-01T10:00:03Z',
    ...overrides,
  };
}

describe('ds4-layer2-p4e-a3-a4-interpretability.v1', () => {
  it('A4 maps N_FULL to existing percentile support gates', () => {
    expect(
      resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({ fullEventCount: 0, metricsAvailable: true }),
    ).toBe('FULL_EVENT_COUNT_LT_3');
    expect(
      resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({ fullEventCount: 2, metricsAvailable: true }),
    ).toBe('FULL_EVENT_COUNT_LT_3');
    expect(
      resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({ fullEventCount: 3, metricsAvailable: true }),
    ).toBe('FULL_EVENT_COUNT_3_TO_9');
    expect(
      resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({ fullEventCount: 9, metricsAvailable: true }),
    ).toBe('FULL_EVENT_COUNT_3_TO_9');
    expect(
      resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({ fullEventCount: 10, metricsAvailable: true }),
    ).toBe('FULL_EVENT_COUNT_GTE_10');
    expect(
      resolveDs4Layer2P4eFullEventEvidenceQuantityTierV1({ fullEventCount: 5, metricsAvailable: false }),
    ).toBe('UNAVAILABLE');
  });

  it('A4 annotation mirrors median/p90 support flags without new thresholds', () => {
    const ann = buildDs4Layer2P4eA4EvidenceSupportAnnotationV1({
      admissibleEventCount: 5,
      fullEventCount: 4,
      binOnlyEventCount: 1,
      specificLongitudinalImpulseMps: 10,
      impulseSemantics: 'SPECIFIC_LONGITUDINAL_IMPULSE_MPS',
      normalizedMeanAccelMps2: 0.01,
      eventFrequencyPerMinute: 1,
      eventFrequencyPerKm: 1,
      maneuverTimeShare: 0.02,
      intensityMedianFullMps2: 1.5,
      intensityP90FullMps2: null,
      intensityMaxAdmissibleMps2: 2,
    });
    expect(ann.evidenceQuantityTier).toBe('FULL_EVENT_COUNT_3_TO_9');
    expect(ann.medianFullIntensitySupported).toBe(true);
    expect(ann.p90FullIntensitySupported).toBe(false);
    expect(ann.evidenceQuantityLabel).toContain('3–9');
  });

  it('A3 holds I_k = S_k × meanEventAcceleration for computed load metrics', () => {
    const records = [
      admissibleRecord({ eventIndex: 0, kind: 'DECELERATION', meanAccelMps2: 2, durationS: 3 }),
      admissibleRecord({ eventIndex: 1, kind: 'DECELERATION', meanAccelMps2: 1.5, durationS: 2, classification: 'ADMISSIBLE_BIN_ONLY', durationTier: 'BIN_ONLY' }),
    ];
    const exposure = emptyDs4DrivingExposureV1('C4_ONLY');
    exposure.derivable = true;
    exposure.exposureSeconds = 600;
    exposure.distanceKm = 10;
    exposure.provenance.qualifyingIntervalCount = 600;
    exposure.provenance.fsmMovingDirectLabelCount = 600;

    const load = computeDs4LongitudinalLoadObservablesV1({
      assessmentStatus: 'UNRATED_COUNTS_ONLY',
      evidenceQuality: 'PRESENT',
      speedAuthority: 'C4_ONLY',
      ratedEventCount: 2,
      unratedEventCount: 0,
      artefactSuspectCount: 0,
      drivingExposure: exposure,
      eventIntensityRecords: records,
    });
    const interp = buildDs4Layer2P4eKindInterpretabilityV1({
      kind: 'deceleration',
      kindObservables: load.deceleration,
      records,
    });
    expect(interp.intensityDecomposition.identityHoldsWithinTolerance).toBe(true);
    expect(interp.intensityDecomposition.meanEventAccelerationMps2).toBeCloseTo(9 / 5, 10);
  });

  it('A3 preserves A2 zero-load identity (0 = 0 × mean)', () => {
    const records = [
      admissibleRecord({ eventIndex: 0, kind: 'DECELERATION', meanAccelMps2: 1.6, durationS: 3 }),
    ];
    const exposure = emptyDs4DrivingExposureV1('C4_ONLY');
    exposure.derivable = true;
    exposure.exposureSeconds = 255;
    exposure.distanceKm = 2.3;
    exposure.provenance.qualifyingIntervalCount = 255;
    exposure.provenance.fsmMovingDirectLabelCount = 255;

    const load = computeDs4LongitudinalLoadObservablesV1({
      assessmentStatus: 'UNRATED_COUNTS_ONLY',
      evidenceQuality: 'PRESENT',
      speedAuthority: 'C4_ONLY',
      ratedEventCount: 1,
      unratedEventCount: 0,
      artefactSuspectCount: 0,
      drivingExposure: exposure,
      eventIntensityRecords: records,
    });
    const accelInterp = buildDs4Layer2P4eKindInterpretabilityV1({
      kind: 'acceleration',
      kindObservables: load.acceleration,
      records,
    });
    expect(load.acceleration.specificLongitudinalImpulseMps).toBe(0);
    expect(accelInterp.intensityDecomposition.identityHoldsWithinTolerance).toBe(true);
    expect(accelInterp.intensityDecomposition.meanEventAccelerationMps2).toBe(0);
  });

  it('A3 unavailable when load metrics gated (UNRATED kind negative control)', () => {
    const decomp = computeDs4Layer2P4eA3IntensityDecompositionV1({
      kindObservables: {
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
      },
      durationSumS: 0,
      impulseValid: true,
    });
    expect(decomp.identityHoldsWithinTolerance).toBeNull();
    expect(decomp.meanEventAccelerationMps2).toBeNull();
  });
});
