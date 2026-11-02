import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  aggregateDs4EventIntensityEligibilityV1,
  evaluateDs4EventIntensityEligibilityV1,
} from '../ds4-assessment-event-intensity-eligibility.v1';

function payload(overrides: Partial<DiV0MotionCoreShadowPayloadV1> = {}): DiV0MotionCoreShadowPayloadV1 {
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
    events: [],
    summary: {
      labelCount: 0,
      speedNumericCount: 0,
      eventCount: 0,
      eventAcceptedCount: 0,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
    ...overrides,
  } as DiV0MotionCoreShadowPayloadV1;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'ACCELERATION',
    startLabel: '2026-01-01T10:00:00Z',
    endLabel: '2026-01-01T10:00:03Z',
    startSpeedKmh: 10,
    endSpeedKmh: 30,
    deltaKmh: 20,
    quality: 'OK',
    flags: [],
    intensity: {
      meanAccelMps2: 1.2,
      durationS: 3,
      steps: 3,
      coverageRatio: 1,
      startUncertaintyS: '±1s',
      endUncertaintyS: '±1s',
    },
    ...overrides,
  };
}

describe('evaluateDs4EventIntensityEligibilityV1', () => {
  it('admits FULL_ELIGIBLE when duration >= 3s and V2 intensity valid', () => {
    const p = payload({ events: [event()] });
    const record = evaluateDs4EventIntensityEligibilityV1({
      payload: p,
      event: p.events![0]!,
      eventIndex: 0,
      speedAuthority: 'C4_ONLY',
    });
    expect(record.classification).toBe('ADMISSIBLE_FULL');
    expect(record.durationTier).toBe('FULL_ELIGIBLE');
    expect(record.reasonCodes).toContain('EVENT_ADMISSIBLE_FULL_ELIGIBLE');
  });

  it('admits BIN_ONLY when duration is exactly 2s', () => {
    const p = payload({
      events: [
        event({
          endLabel: '2026-01-01T10:00:02Z',
          intensity: { meanAccelMps2: 1.2, durationS: 2, steps: 2, coverageRatio: 1, startUncertaintyS: '±1s', endUncertaintyS: '±1s' },
        }),
      ],
    });
    const record = evaluateDs4EventIntensityEligibilityV1({
      payload: p,
      event: p.events![0]!,
      eventIndex: 0,
      speedAuthority: 'C5_1_PREFERRED',
    });
    expect(record.classification).toBe('ADMISSIBLE_BIN_ONLY');
    expect(record.speedAuthority).toBe('C5_1_PREFERRED');
  });

  it('never infers V1 intensity on legacy contract', () => {
    const p = payload({
      contract: { ...payload().contract, persistence: undefined },
      events: [event({ intensity: undefined })],
    });
    const record = evaluateDs4EventIntensityEligibilityV1({
      payload: p,
      event: p.events![0]!,
      eventIndex: 0,
      speedAuthority: 'C4_ONLY',
    });
    expect(record.classification).toBe('UNRATED');
    expect(record.reasonCodes).toContain('EVENT_INTENSITY_UNAVAILABLE_V1_LEGACY');
  });

  it('unrates incomplete coverage and steps mismatch', () => {
    const incomplete = evaluateDs4EventIntensityEligibilityV1({
      payload: payload({ events: [event({ intensity: { meanAccelMps2: 1, durationS: 3, steps: 3, coverageRatio: 0.5, startUncertaintyS: '±1s', endUncertaintyS: '±1s' } })] }),
      event: payload({ events: [event({ intensity: { meanAccelMps2: 1, durationS: 3, steps: 3, coverageRatio: 0.5, startUncertaintyS: '±1s', endUncertaintyS: '±1s' } })] }).events![0]!,
      eventIndex: 0,
      speedAuthority: 'C4_ONLY',
    });
    expect(incomplete.reasonCodes).toContain('EVENT_COVERAGE_INCOMPLETE');

    const mismatch = evaluateDs4EventIntensityEligibilityV1({
      payload: payload({ events: [event({ intensity: { meanAccelMps2: 1, durationS: 3, steps: 2, coverageRatio: 1, startUncertaintyS: '±1s', endUncertaintyS: '±1s' } })] }),
      event: payload({ events: [event({ intensity: { meanAccelMps2: 1, durationS: 3, steps: 2, coverageRatio: 1, startUncertaintyS: '±1s', endUncertaintyS: '±1s' } })] }).events![0]!,
      eventIndex: 0,
      speedAuthority: 'C4_ONLY',
    });
    expect(mismatch.reasonCodes).toContain('EVENT_STEPS_DURATION_MISMATCH');
  });

  it('excludes artefacts separately from unrated accepted events', () => {
    const agg = aggregateDs4EventIntensityEligibilityV1({
      payload: payload({
        events: [
          event({ quality: 'ARTEFACT_SUSPECT' }),
          event({ quality: 'OK', intensity: undefined }),
        ],
      }),
      speedAuthority: 'C4_ONLY',
    });
    expect(agg.acceleration.excludedArtefacts).toBe(1);
    expect(agg.acceleration.unratedEvents).toBe(1);
    expect(agg.acceleration.admissibleShareOfAccepted).toBe(0);
  });
});
