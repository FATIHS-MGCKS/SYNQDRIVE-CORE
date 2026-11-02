import {
  aggregateDs4EventIntensityEligibilityV1,
  evaluateDs4EventIntensityEligibilityV1,
} from '../../ds4-assessment/ds4-assessment-event-intensity-eligibility.v1';
import { resolveDs4LongitudinalEvidenceQualityForLayer2V1 } from '../../ds4-assessment/ds4-longitudinal-evidence-quality.v1';
import { emptyDs4DrivingExposureV1 } from '../../ds4-assessment/ds4-assessment-driving-exposure.v1';
import {
  applyMotionEventIntensityEvidenceGatesV1,
  applyMotionEventSharedKnotSpikePairGate,
  assessSharedKnotSpikePairIndicatorsV1,
  detectMotionManoeuvreEvents,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  type MotionCoreSpeedSample,
  type MotionManoeuvreEvent,
} from '../../core';
import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4TripAssessmentEventSummariesV1 } from '../../ds4-assessment/ds4-trip-assessment-v1.engine';

function sample(
  label: string,
  valueKmh: number,
  quality: MotionCoreSpeedSample['quality'] = 'OK',
  flags: string[] = [],
): MotionCoreSpeedSample {
  return {
    label,
    valueKmh,
    quality,
    estimator: 'TEST',
    supportLabels: [],
    supportSpanS: null,
    flags,
  };
}

function payloadWithEvents(events: DiV0MotionCoreShadowPayloadV1['events']): DiV0MotionCoreShadowPayloadV1 {
  return {
    contract: {
      algorithmVersions: {
        c4: 'c4',
        c5_1: null,
        c5_1ProductionSafety: null,
        c5_1AlgorithmFileSha256: null,
        fsm: 'fsm',
        gapBridgeV1: null,
        fsmAuxBinding: null,
        events: 'ev',
        bundle: 'b1',
      },
      speedAuthority: 'C4_ONLY',
      persistence: DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2,
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS: 1,
        c4FullFinalizationForwardS: 1,
        fsmMode: 'RETROSPECTIVE',
        eventFinalizationNote: 'test',
        computedAtUtc: '2026-01-01T00:00:00.000Z',
      },
      sparse: { channelOutcome: null, comparable: false, sampleCount: 0, samples: [], limitations: [] },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    },
    speeds: [],
    fsmLabels: [],
    stopEpisodes: [],
    events,
    summary: {
      labelCount: 0,
      speedNumericCount: 0,
      eventCount: events.length,
      eventAcceptedCount: 0,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
  } as DiV0MotionCoreShadowPayloadV1;
}

function apiSyntheticSummaries(
  overrides: Partial<Ds4TripAssessmentEventSummariesV1> & {
    speedAuthority?: 'C4_ONLY' | 'C5_1_PREFERRED';
  } = {},
): Ds4TripAssessmentEventSummariesV1 {
  const speedAuthority = overrides.speedAuthority ?? 'C5_1_PREFERRED';
  const baseExposure = emptyDs4DrivingExposureV1(speedAuthority);
  return {
    acceptedAccelerationCount: 0,
    acceptedDecelerationCount: 0,
    artefactSuspectCount: 0,
    ratedEventCount: 10,
    unratedEventCount: 0,
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
      derivable: true,
      exposureSeconds: 1500,
      distanceKm: 14,
      provenance: {
        ...baseExposure.provenance,
        speedAuthority,
        canonicalSpeedSeriesMissing: false,
        qualifyingIntervalCount: 1500,
        fsmMovingDirectLabelCount: 1200,
      },
    },
    eventIntensityRecords: [],
    usableTemporalCoverage: { labelCount: 2000, directFsmLabelCount: 1200, speedNumericCount: 1500 },
    ...overrides,
  };
}

describe('motion event intensity endpoint evidence gates (Arteon P1)', () => {
  /** 1 Hz densification so minSteps=2 secants exist; knot flags match prod ABSTAINED/CONFLICT. */
  const arteonSeries: MotionCoreSpeedSample[] = [
    sample('2026-10-09T17:51:02Z', 25.0),
    sample('2026-10-09T17:51:03Z', 26.2),
    sample('2026-10-09T17:51:04Z', 27.41289316884732),
    sample('2026-10-09T17:51:05Z', 100),
    sample(
      '2026-10-09T17:51:06Z',
      220.0099008876615,
      'JITTER_SUSPECT',
      ['SPEED_EVIDENCE_ABSTAINED', 'CROSS_SOURCE_CONFLICT'],
    ),
    sample('2026-10-09T17:51:07Z', 100),
    sample('2026-10-09T17:51:08Z', 22.75557021062836),
    sample('2026-10-09T17:51:09Z', 22.0),
    sample('2026-10-09T17:51:10Z', 21.5),
  ];

  it('Arteon 27→220→23: no admissible ACCEL/BRAKE intensity after gates', () => {
    const events = detectMotionManoeuvreEvents(
      0,
      arteonSeries,
      'C4_ADAPTIVE_L3',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, arteonSeries);

    const hi = events.filter((e) => (e.meanAccelMps2 ?? 0) > 15);
    expect(hi.length).toBeGreaterThan(0);
    expect(hi.every((e) => e.quality === 'ARTEFACT_SUSPECT')).toBe(true);
    expect(hi.some((e) => e.flags.some((f) => f.includes('INTENSITY_ENDPOINT_EVIDENCE')))).toBe(true);

    const payload = payloadWithEvents(
      events.map((e) => ({
        kind: e.kind,
        startLabel: e.startLabel,
        endLabel: e.endLabel,
        startSpeedKmh: e.startSpeedKmh,
        endSpeedKmh: e.endSpeedKmh,
        deltaKmh: e.deltaKmh,
        quality: e.quality,
        flags: e.flags,
        intensity:
          e.quality === 'ARTEFACT_SUSPECT'
            ? undefined
            : {
                meanAccelMps2: e.meanAccelMps2,
                durationS: e.durationS,
                steps: e.steps,
                coverageRatio: e.coverageRatio,
                startUncertaintyS: e.startUncertaintyS,
                endUncertaintyS: e.endUncertaintyS,
              },
      })),
    );

    const agg = aggregateDs4EventIntensityEligibilityV1({ payload, speedAuthority: 'C4_ONLY' });
    const admissible = agg.records.filter(
      (r) => r.classification === 'ADMISSIBLE_BIN_ONLY' || r.classification === 'ADMISSIBLE_FULL',
    );
    expect(admissible.filter((r) => r.meanAccelMps2 != null && r.meanAccelMps2 > 15)).toHaveLength(0);
  });

  it('preserves raw diagnostic flags on artefact events', () => {
    const events = detectMotionManoeuvreEvents(
      0,
      arteonSeries,
      'C4_ADAPTIVE_L3',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, arteonSeries);
    const suspect = events.find((e) => e.meanAccelMps2 != null && e.meanAccelMps2 > 15);
    expect(suspect?.meanAccelMps2).toBeCloseTo(26.75, 2);
    expect(suspect?.flags.some((f) => f.includes('INTENSITY_ENDPOINT_EVIDENCE'))).toBe(true);
  });

  it('valid neighbors stay admissible with corrupt 27.41→220.01→22.76 knot (no trip-wide exclusion)', () => {
    const tripSeries: MotionCoreSpeedSample[] = [
      sample('2026-10-09T17:50:00Z', 30),
      sample('2026-10-09T17:50:01Z', 35),
      sample('2026-10-09T17:50:02Z', 42),
      sample('2026-10-09T17:50:03Z', 50),
      sample('2026-10-09T17:50:04Z', 58),
      sample('2026-10-09T17:50:05Z', 58),
      sample('2026-10-09T17:50:06Z', 55),
      sample('2026-10-09T17:50:07Z', 50),
      sample('2026-10-09T17:50:08Z', 40),
      sample('2026-10-09T17:50:09Z', 30),
      sample('2026-10-09T17:50:10Z', 27.41),
      sample('2026-10-09T17:50:11Z', 100),
      sample(
        '2026-10-09T17:50:12Z',
        220.01,
        'JITTER_SUSPECT',
        ['SPEED_EVIDENCE_ABSTAINED', 'CROSS_SOURCE_CONFLICT'],
      ),
      sample('2026-10-09T17:50:13Z', 100),
      sample('2026-10-09T17:50:14Z', 22.76),
      sample('2026-10-09T17:50:15Z', 22),
      sample('2026-10-09T17:50:16Z', 24),
      sample('2026-10-09T17:50:17Z', 28),
      sample('2026-10-09T17:50:18Z', 34),
      sample('2026-10-09T17:50:19Z', 42),
      sample('2026-10-09T17:50:20Z', 50),
    ];

    const events = detectMotionManoeuvreEvents(
      0,
      tripSeries,
      'C4_ADAPTIVE_L3',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, tripSeries);

    const corruptSecants = events.filter((e) => (e.meanAccelMps2 ?? 0) > 15);
    expect(corruptSecants).toHaveLength(2);
    expect(corruptSecants.every((e) => e.quality === 'ARTEFACT_SUSPECT')).toBe(true);
    expect(corruptSecants.every((e) => e.flags.some((f) => f.includes('INTENSITY_ENDPOINT_EVIDENCE')))).toBe(true);

    const trustedEvents = events.filter((e) => e.quality !== 'ARTEFACT_SUSPECT');
    expect(trustedEvents.length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.quality === 'ARTEFACT_SUSPECT')).toBe(true);
    expect(trustedEvents.length).toBeLessThan(events.length);

    const persistedRows = events.map((e) => ({
      kind: e.kind,
      startLabel: e.startLabel,
      endLabel: e.endLabel,
      startSpeedKmh: e.startSpeedKmh,
      endSpeedKmh: e.endSpeedKmh,
      deltaKmh: e.deltaKmh,
      quality: e.quality,
      flags: e.flags,
      intensity: {
        meanAccelMps2: e.meanAccelMps2,
        durationS: e.durationS,
        steps: e.steps,
        coverageRatio: e.coverageRatio,
        startUncertaintyS: e.startUncertaintyS,
        endUncertaintyS: e.endUncertaintyS,
      },
    }));

    const agg = aggregateDs4EventIntensityEligibilityV1({
      payload: payloadWithEvents(persistedRows),
      speedAuthority: 'C4_ONLY',
    });

    const excluded = agg.records.filter((r) => r.classification === 'EXCLUDED_ARTEFACT');
    expect(excluded).toHaveLength(2);
    expect(excluded.every((r) => r.meanAccelMps2 === null)).toBe(true);
    expect(excluded.every((r) => r.meanAccelMps2 !== 0)).toBe(true);

    const admissible = agg.records.filter(
      (r) => r.classification === 'ADMISSIBLE_BIN_ONLY' || r.classification === 'ADMISSIBLE_FULL',
    );
    expect(admissible.length).toBeGreaterThanOrEqual(2);
    expect(admissible.every((r) => r.meanAccelMps2 != null && r.meanAccelMps2 > 0 && r.meanAccelMps2 < 10)).toBe(true);
    expect(agg.records.filter((r) => r.meanAccelMps2 === 0)).toHaveLength(0);
  });

  it('valid BIN_ONLY 2s secant remains admissible', () => {
    const series = [
      sample('2026-10-01T10:00:00Z', 30),
      sample('2026-10-01T10:00:01Z', 35),
      sample('2026-10-01T10:00:02Z', 42),
      sample('2026-10-01T10:00:03Z', 50),
      sample('2026-10-01T10:00:04Z', 58),
    ];
    const events = detectMotionManoeuvreEvents(
      0,
      series,
      'TEST',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, series);
    const ev = events.find((e) => e.durationS === 2 && e.kind === 'ACCELERATION');
    expect(ev).toBeDefined();
    expect(ev!.quality).not.toBe('ARTEFACT_SUSPECT');
    const row = {
      kind: ev!.kind,
      startLabel: ev!.startLabel,
      endLabel: ev!.endLabel,
      startSpeedKmh: ev!.startSpeedKmh,
      endSpeedKmh: ev!.endSpeedKmh,
      deltaKmh: ev!.deltaKmh,
      quality: ev!.quality,
      flags: ev!.flags,
      intensity: {
        meanAccelMps2: ev!.meanAccelMps2,
        durationS: ev!.durationS,
        steps: ev!.steps,
        coverageRatio: ev!.coverageRatio,
        startUncertaintyS: ev!.startUncertaintyS,
        endUncertaintyS: ev!.endUncertaintyS,
      },
    };
    const record = evaluateDs4EventIntensityEligibilityV1({
      payload: payloadWithEvents([row]),
      event: row,
      eventIndex: 0,
      speedAuthority: 'C4_ONLY',
    });
    expect(record.classification).toBe('ADMISSIBLE_BIN_ONLY');
  });

  it('valid FULL 3s event unchanged', () => {
    const series = [
      sample('2026-10-01T11:00:00Z', 30),
      sample('2026-10-01T11:00:01Z', 35),
      sample('2026-10-01T11:00:02Z', 42),
      sample('2026-10-01T11:00:03Z', 50),
      sample('2026-10-01T11:00:04Z', 58),
    ];
    const events = detectMotionManoeuvreEvents(
      0,
      series,
      'TEST',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, series);
    const ev = events.find((e) => e.durationS >= 3 && e.kind === 'ACCELERATION');
    expect(ev?.quality).not.toBe('ARTEFACT_SUSPECT');
  });

  it('shared conflict knot marks opposite secants at isolated spike (27→220→23)', () => {
    const knotSeries = [
      sample('2026-10-09T17:51:04Z', 27.41),
      sample(
        '2026-10-09T17:51:06Z',
        220.01,
        'JITTER_SUSPECT',
        ['SPEED_EVIDENCE_ABSTAINED', 'CROSS_SOURCE_CONFLICT'],
      ),
      sample('2026-10-09T17:51:08Z', 22.76),
    ];
    const events: MotionManoeuvreEvent[] = [
      {
        trip: 0,
        kind: 'ACCELERATION' as const,
        startLabel: '2026-10-09T17:51:04Z',
        endLabel: '2026-10-09T17:51:06Z',
        startUncertaintyS: '',
        endUncertaintyS: '',
        startSpeedKmh: 27.4,
        endSpeedKmh: 220,
        deltaKmh: 192.6,
        meanAccelMps2: 26.75,
        peakAccel1sMps2: 26.75,
        peakAccel2sMps2: null,
        durationS: 2,
        steps: 2,
        coverageRatio: 1,
        quality: 'DEGRADED' as const,
        source: 'TEST',
        algorithmVersion: 'TEST',
        flags: ['CROSS_SOURCE_CONFLICT', 'SPEED_EVIDENCE_ABSTAINED'],
      },
      {
        trip: 0,
        kind: 'DECELERATION' as const,
        startLabel: '2026-10-09T17:51:06Z',
        endLabel: '2026-10-09T17:51:08Z',
        startUncertaintyS: '',
        endUncertaintyS: '',
        startSpeedKmh: 220,
        endSpeedKmh: 22.8,
        deltaKmh: 197.2,
        meanAccelMps2: 27.396,
        peakAccel1sMps2: 27.396,
        peakAccel2sMps2: null,
        durationS: 2,
        steps: 2,
        coverageRatio: 1,
        quality: 'DEGRADED' as const,
        source: 'TEST',
        algorithmVersion: 'TEST',
        flags: ['CROSS_SOURCE_CONFLICT', 'SPEED_EVIDENCE_ABSTAINED'],
      },
    ];
    applyMotionEventIntensityEvidenceGatesV1(events, knotSeries);
    expect(events.every((e) => e.quality === 'ARTEFACT_SUSPECT')).toBe(true);
    expect(events.some((e) => e.flags.some((f) => f.startsWith('SHARED_CONFLICT_KNOT')))).toBe(true);
    expect(events[0]!.meanAccelMps2).toBeCloseTo(26.75, 2);
  });

  it('Audi conflict endpoint flags reject admissibility', () => {
    const series = [
      sample('2026-10-01T12:00:00Z', 50),
      sample('2026-10-01T12:00:01Z', 52),
      sample('2026-10-01T12:00:02Z', 54),
      sample('2026-10-01T12:00:03Z', 210, 'JITTER_SUSPECT', ['CROSS_SOURCE_CONFLICT']),
      sample('2026-10-01T12:00:04Z', 120),
      sample('2026-10-01T12:00:05Z', 56),
      sample('2026-10-01T12:00:06Z', 54),
    ];
    const events = detectMotionManoeuvreEvents(
      0,
      series,
      'TEST',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, series);
    expect(events.some((e) => e.quality === 'ARTEFACT_SUSPECT')).toBe(true);
  });

  it('Tesla API_SYNTHETIC L2 gate unchanged (C5.1 valid longitudinal path)', () => {
    const l2 = resolveDs4LongitudinalEvidenceQualityForLayer2V1({
      assessmentEvidenceQuality: 'NOT_APPLICABLE',
      speedAuthority: 'C5_1_PREFERRED',
      eventSummaries: apiSyntheticSummaries({ speedAuthority: 'C5_1_PREFERRED' }),
      context: {
        sourceFamily: 'API_SYNTHETIC',
        sparseChannelOutcome: 'NOT_APPLICABLE',
        channelManifest: [{ channel: 'POSITION', outcome: 'PRESENT' }],
      },
    });
    expect(l2.layer2EvidenceQualityInput).toBe('PRESENT');
    expect(l2.sparseChannelOutcomeUnmodified).toBe('NOT_APPLICABLE');
  });

  it('R1 Tiguan-style trusted endpoints remain admissible after gates', () => {
    const series = [
      sample('2026-09-01T08:00:00Z', 30),
      sample('2026-09-01T08:00:01Z', 35),
      sample('2026-09-01T08:00:02Z', 42),
      sample('2026-09-01T08:00:03Z', 50),
      sample('2026-09-01T08:00:04Z', 58),
    ];
    const events = detectMotionManoeuvreEvents(
      0,
      series,
      'C4_ADAPTIVE_L3',
      MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
      MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
    );
    applyMotionEventIntensityEvidenceGatesV1(events, series);
    const ev = events.find((e) => e.durationS === 2 && e.kind === 'ACCELERATION');
    expect(ev?.quality).not.toBe('ARTEFACT_SUSPECT');
  });

  describe('SHARED_KNOT_SPIKE_PAIR safety gate', () => {
    const dbdded5cKnot = '2026-10-28T10:46:17Z';

    function dbdded5cSpikeSeries(): MotionCoreSpeedSample[] {
      const labels = [
        '2026-10-28T10:46:05Z',
        '2026-10-28T10:46:06Z',
        '2026-10-28T10:46:07Z',
        '2026-10-28T10:46:08Z',
        '2026-10-28T10:46:09Z',
        '2026-10-28T10:46:10Z',
        '2026-10-28T10:46:11Z',
        '2026-10-28T10:46:12Z',
        '2026-10-28T10:46:13Z',
        '2026-10-28T10:46:14Z',
        '2026-10-28T10:46:15Z',
        '2026-10-28T10:46:16Z',
        dbdded5cKnot,
        '2026-10-28T10:46:18Z',
        '2026-10-28T10:46:19Z',
        '2026-10-28T10:46:20Z',
        '2026-10-28T10:46:21Z',
      ];
      const speeds = [
        71.3, 70.1, 69.9, 70.0, 70.0, 70.1, 69.3, 66.0, 61.0, 57.7, 63.0, 100.1, 119.82, 83.2, 58.2, 58.1, 58.3,
      ];
      return labels.map((label, i) => sample(label, speeds[i]!));
    }

    function dbdded5cRepairEvidence() {
      return [
        { bucketLabelUtc: '2026-10-28T10:46:15Z', q5Evidence: 'VIOLATION', q6Evidence: 'VIOLATION' },
        { bucketLabelUtc: dbdded5cKnot, q5Evidence: 'VIOLATION', q6Evidence: 'VIOLATION' },
        { bucketLabelUtc: '2026-10-28T10:46:18Z', q5Evidence: 'VIOLATION', q6Evidence: 'VIOLATION' },
      ];
    }

    it('dbdded5c-style plateau spike pair: indices 2/3 marked ARTEFACT_SUSPECT with SHARED_KNOT_SPIKE_PAIR flag', () => {
      const series = dbdded5cSpikeSeries();
      const events = detectMotionManoeuvreEvents(
        0,
        series,
        'C4_ADAPTIVE_L3',
        MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
        MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
      );
      applyMotionEventIntensityEvidenceGatesV1(events, series, {
        c51RepairEvidence: dbdded5cRepairEvidence(),
      });
      const accel = events.find(
        (e) => e.kind === 'ACCELERATION' && e.startLabel === '2026-10-28T10:46:15Z' && e.endLabel === dbdded5cKnot,
      );
      const brake = events.find(
        (e) => e.kind === 'DECELERATION' && e.startLabel === dbdded5cKnot && e.endLabel === '2026-10-28T10:46:19Z',
      );
      expect(accel?.quality).toBe('ARTEFACT_SUSPECT');
      expect(brake?.quality).toBe('ARTEFACT_SUSPECT');
      expect(accel?.flags.some((f) => f.startsWith('SHARED_KNOT_SPIKE_PAIR='))).toBe(true);
      expect(brake?.flags.some((f) => f.startsWith('SHARED_KNOT_SPIKE_PAIR='))).toBe(true);
      const agg = aggregateDs4EventIntensityEligibilityV1({
        payload: payloadWithEvents(
          events.map((e, idx) => ({
            kind: e.kind,
            startLabel: e.startLabel,
            endLabel: e.endLabel,
            startSpeedKmh: e.startSpeedKmh,
            endSpeedKmh: e.endSpeedKmh,
            deltaKmh: e.deltaKmh,
            quality: e.quality,
            flags: e.flags,
            intensity: {
              meanAccelMps2: e.meanAccelMps2,
              durationS: e.durationS,
              steps: e.steps,
              coverageRatio: e.coverageRatio,
              startUncertaintyS: e.startUncertaintyS,
              endUncertaintyS: e.endUncertaintyS,
            },
          })),
        ),
        speedAuthority: 'C5_1_PREFERRED',
      });
      const idx2 = agg.records.find((r) => r.startLabel === '2026-10-28T10:46:15Z' && r.kind === 'ACCELERATION');
      const idx3 = agg.records.find((r) => r.startLabel === dbdded5cKnot && r.kind === 'DECELERATION');
      expect(idx2?.classification).toBe('EXCLUDED_ARTEFACT');
      expect(idx3?.classification).toBe('EXCLUDED_ARTEFACT');
    });

    it('hard braking ACCEL→DECEL at shared peak without spike reversion stays admissible', () => {
      const series = [
        sample('2026-10-01T10:00:00Z', 55),
        sample('2026-10-01T10:00:01Z', 62),
        sample('2026-10-01T10:00:02Z', 70),
        sample('2026-10-01T10:00:03Z', 78),
        sample('2026-10-01T10:00:04Z', 86),
        sample('2026-10-01T10:00:05Z', 94),
        sample('2026-10-01T10:00:06Z', 100),
        sample('2026-10-01T10:00:07Z', 92),
        sample('2026-10-01T10:00:08Z', 82),
        sample('2026-10-01T10:00:09Z', 70),
        sample('2026-10-01T10:00:10Z', 58),
      ];
      const events = detectMotionManoeuvreEvents(
        0,
        series,
        'C4_ADAPTIVE_L3',
        MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities,
        MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
      );
      applyMotionEventIntensityEvidenceGatesV1(events, series);
      const trusted = events.filter((e) => e.quality !== 'ARTEFACT_SUSPECT');
      expect(trusted.length).toBeGreaterThan(0);
      expect(trusted.some((e) => e.flags.some((f) => f.startsWith('SHARED_KNOT_SPIKE_PAIR=')))).toBe(false);
    });

    it('missing knot samples: fail closed (no SHARED_KNOT_SPIKE_PAIR confirmation)', () => {
      const accel: MotionManoeuvreEvent = {
        trip: 0,
        kind: 'ACCELERATION',
        startLabel: '2026-10-01T10:00:00Z',
        endLabel: '2026-10-01T10:00:02Z',
        startUncertaintyS: '',
        endUncertaintyS: '',
        startSpeedKmh: 30,
        endSpeedKmh: 120,
        deltaKmh: 90,
        meanAccelMps2: 12,
        peakAccel1sMps2: 12,
        peakAccel2sMps2: null,
        durationS: 2,
        steps: 2,
        coverageRatio: 1,
        quality: 'OK',
        source: 'TEST',
        algorithmVersion: 'TEST',
        flags: [],
      };
      const decel: MotionManoeuvreEvent = {
        ...accel,
        kind: 'DECELERATION',
        startLabel: '2026-10-01T10:00:02Z',
        endLabel: '2026-10-01T10:00:04Z',
        endSpeedKmh: 30,
        deltaKmh: 90,
      };
      const sparseSeries = [sample('2026-10-01T10:00:00Z', 30), sample('2026-10-01T10:00:02Z', 120)];
      applyMotionEventSharedKnotSpikePairGate([accel, decel], sparseSeries);
      expect(accel.quality).toBe('OK');
      expect(decel.quality).toBe('OK');
    });

    it('assessSharedKnotSpikePairIndicatorsV1 counts geometry and C5.1 independently', () => {
      const series = dbdded5cSpikeSeries();
      const ordered = series.filter((s) => s.valueKmh != null).sort((a, b) => a.label.localeCompare(b.label));
      const ki = ordered.findIndex((s) => s.label === dbdded5cKnot);
      const assessment = assessSharedKnotSpikePairIndicatorsV1({
        accel: {
          trip: 0,
          kind: 'ACCELERATION',
          startLabel: '2026-10-28T10:46:15Z',
          endLabel: dbdded5cKnot,
          startUncertaintyS: '',
          endUncertaintyS: '',
          startSpeedKmh: 63,
          endSpeedKmh: 119.8,
          deltaKmh: 56.9,
          meanAccelMps2: 7.898,
          peakAccel1sMps2: 7.898,
          peakAccel2sMps2: null,
          durationS: 2,
          steps: 2,
          coverageRatio: 1,
          quality: 'OK',
          source: 'TEST',
          algorithmVersion: 'TEST',
          flags: [],
        },
        decel: {
          trip: 0,
          kind: 'DECELERATION',
          startLabel: dbdded5cKnot,
          endLabel: '2026-10-28T10:46:19Z',
          startUncertaintyS: '',
          endUncertaintyS: '',
          startSpeedKmh: 119.8,
          endSpeedKmh: 58.2,
          deltaKmh: 61.6,
          meanAccelMps2: 8.561,
          peakAccel1sMps2: 8.561,
          peakAccel2sMps2: null,
          durationS: 2,
          steps: 2,
          coverageRatio: 1,
          quality: 'OK',
          source: 'TEST',
          algorithmVersion: 'TEST',
          flags: [],
        },
        knot: ordered[ki]!,
        prev: ordered[ki - 1]!,
        next: ordered[ki + 1]!,
        c51RepairEvidence: new Map([
          [dbdded5cKnot, { q5: 'VIOLATION', q6: 'VIOLATION' }],
        ]),
      });
      expect(assessment.classicSharedConflictKnot).toBe(false);
      expect(assessment.physicsCorridorSpikeReversion).toBe(true);
      expect(assessment.c51Q5Q6Violation).toBe(true);
      expect(assessment.independentIndicatorCount).toBe(2);
      expect(assessment.confirmedArtefactPair).toBe(true);
    });
  });
});
