import { emptyDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import type { Ds4TripAssessmentEventSummariesV1 } from '../ds4-trip-assessment-v1.engine';
import {
  buildDs4LongitudinalLoadObservablesInputFromPersistedAssessmentV1,
  computeDs4LongitudinalLoadObservablesV1,
} from '../ds4-longitudinal-load-observables.v1';
import { resolveDs4LongitudinalEvidenceQualityForLayer2V1 } from '../ds4-longitudinal-evidence-quality.v1';

function apiSyntheticSummaries(
  overrides: Partial<Ds4TripAssessmentEventSummariesV1> & {
    speedAuthority?: 'C4_ONLY' | 'C5_1_PREFERRED';
    exposureSeconds?: number;
  } = {},
): Ds4TripAssessmentEventSummariesV1 {
  const speedAuthority = overrides.speedAuthority ?? 'C4_ONLY';
  const exposureSeconds = overrides.exposureSeconds ?? 1500;
  const baseExposure = emptyDs4DrivingExposureV1(speedAuthority);
  return {
    acceptedAccelerationCount: 0,
    acceptedDecelerationCount: 0,
    artefactSuspectCount: 0,
    ratedEventCount: overrides.ratedEventCount ?? 10,
    unratedEventCount: overrides.unratedEventCount ?? 0,
    accelerationOrdinalValues: [],
    decelerationOrdinalValues: [],
    intensityAcceleration: {
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
    },
    intensityDeceleration: {
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
    },
    drivingExposure: {
      ...baseExposure,
      derivable: overrides.drivingExposure?.derivable ?? true,
      exposureSeconds: overrides.drivingExposure?.exposureSeconds ?? exposureSeconds,
      distanceKm: overrides.drivingExposure?.distanceKm ?? 14,
      provenance: {
        ...baseExposure.provenance,
        speedAuthority,
        canonicalSpeedSeriesMissing:
          overrides.drivingExposure?.provenance?.canonicalSpeedSeriesMissing ?? false,
        qualifyingIntervalCount:
          overrides.drivingExposure?.provenance?.qualifyingIntervalCount ?? exposureSeconds,
        fsmMovingDirectLabelCount:
          overrides.drivingExposure?.provenance?.fsmMovingDirectLabelCount ?? 1200,
      },
    },
    eventIntensityRecords: overrides.eventIntensityRecords ?? [],
    usableTemporalCoverage: { labelCount: 2000, directFsmLabelCount: 1200, speedNumericCount: 1500 },
    ...overrides,
  };
}

const positionPresentManifest = [{ channel: 'POSITION', outcome: 'PRESENT' }] as const;

describe('resolveDs4LongitudinalEvidenceQualityForLayer2V1', () => {
  it('R1 PRESENT unchanged (legacy path)', () => {
    const summaries = apiSyntheticSummaries();
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'PRESENT',
      speedAuthority: 'C4_ONLY',
      eventSummaries: summaries,
      context: {
        sourceFamily: 'RUPTELA_R1',
        sparseChannelOutcome: 'PRESENT',
        channelManifest: [{ channel: 'R1_OBD', outcome: 'PRESENT' }],
      },
    });
    expect(r.layer2EvidenceQualityInput).toBe('PRESENT');
    expect(r.supplementaryReasonCodes).toEqual([]);
  });

  it('R1 PRESENT_SPARSE still fails Layer 2 input (unchanged)', () => {
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'PRESENT_SPARSE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: apiSyntheticSummaries(),
      context: {
        sourceFamily: 'RUPTELA_R1',
        sparseChannelOutcome: 'PRESENT_SPARSE',
      },
    });
    expect(r.layer2EvidenceQualityInput).toBe('PRESENT_SPARSE');
  });

  it('API_SYNTHETIC C5.1 valid longitudinal evidence passes without mutating sparse outcome', () => {
    const summaries = apiSyntheticSummaries({ speedAuthority: 'C5_1_PREFERRED' });
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C5_1_PREFERRED',
      eventSummaries: summaries,
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(r.layer2EvidenceQualityInput).toBe('PRESENT');
    expect(r.sparseChannelOutcomeUnmodified).toBe('NOT_APPLICABLE');
  });

  it('API_SYNTHETIC C4 valid evidence passes', () => {
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: apiSyntheticSummaries({ speedAuthority: 'C4_ONLY' }),
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(r.layer2EvidenceQualityInput).toBe('PRESENT');
  });

  it('API_SYNTHETIC position-only (POSITION missing) fails closed', () => {
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: apiSyntheticSummaries(),
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [],
      },
    });
    expect(r.layer2EvidenceQualityInput).not.toBe('PRESENT');
    expect(r.supplementaryReasonCodes).toContain('LONGITUDINAL_EVIDENCE_API_SYNTHETIC_POSITION_NOT_PRESENT');
  });

  it('API_SYNTHETIC rated events absent fails closed', () => {
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: apiSyntheticSummaries({ ratedEventCount: 0 }),
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(r.layer2EvidenceQualityInput).not.toBe('PRESENT');
    expect(r.supplementaryReasonCodes).toContain('LONGITUDINAL_EVIDENCE_API_SYNTHETIC_RATED_EVENTS_ABSENT');
  });

  it('API_SYNTHETIC degraded speed / exposure fails closed', () => {
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: apiSyntheticSummaries({
        drivingExposure: {
          ...emptyDs4DrivingExposureV1('C4_ONLY'),
          derivable: false,
          exposureSeconds: null as unknown as number,
          distanceKm: null as unknown as number,
          provenance: {
            ...emptyDs4DrivingExposureV1('C4_ONLY').provenance,
            canonicalSpeedSeriesMissing: true,
            qualifyingIntervalCount: 0,
            fsmMovingDirectLabelCount: 0,
          },
        },
      }),
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(r.layer2EvidenceQualityInput).not.toBe('PRESENT');
    expect(r.supplementaryReasonCodes).toContain('LONGITUDINAL_EVIDENCE_API_SYNTHETIC_EXPOSURE_OR_TEMPORAL_FAIL');
  });

  it('API_SYNTHETIC missing temporal FSM direct labels fails closed', () => {
    const summaries = apiSyntheticSummaries({
      drivingExposure: {
        ...emptyDs4DrivingExposureV1('C4_ONLY'),
        derivable: true,
        exposureSeconds: 100,
        distanceKm: 1,
        provenance: {
          ...emptyDs4DrivingExposureV1('C4_ONLY').provenance,
          canonicalSpeedSeriesMissing: false,
          qualifyingIntervalCount: 100,
          fsmMovingDirectLabelCount: 0,
        },
      },
    });
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: summaries,
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(r.layer2EvidenceQualityInput).not.toBe('PRESENT');
    expect(r.supplementaryReasonCodes).toContain('LONGITUDINAL_EVIDENCE_API_SYNTHETIC_EXPOSURE_OR_TEMPORAL_FAIL');
  });

  it('cross-source: R1 ignores API synthetic exposure path', () => {
    const r = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C4_ONLY',
      eventSummaries: apiSyntheticSummaries(),
      context: {
        sourceFamily: 'RUPTELA_R1',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(r.layer2EvidenceQualityInput).toBe('NOT_APPLICABLE');
  });
});

describe('Layer 2 integration with API_SYNTHETIC context', () => {
  it('NOT_APPLICABLE assessment with valid synthetic context yields empty L2 reason codes', () => {
    const summaries = apiSyntheticSummaries({ speedAuthority: 'C5_1_PREFERRED' });
    const input = buildDs4LongitudinalLoadObservablesInputFromPersistedAssessmentV1({
      assessmentStatus: 'UNRATED_COUNTS_ONLY',
      evidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C5_1_PREFERRED',
      eventSummariesJson: summaries,
      evidenceQualityContext: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [...positionPresentManifest],
      },
    });
    expect(input.evidenceQuality).toBe('PRESENT');
    const out = computeDs4LongitudinalLoadObservablesV1(input);
    expect(out.reasonCodes).not.toContain('EVIDENCE_QUALITY_NOT_PRESENT');
  });
});
