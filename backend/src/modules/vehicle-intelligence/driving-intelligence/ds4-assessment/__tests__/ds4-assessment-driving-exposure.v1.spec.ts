import { DI_V0_MOTION_CORE_SHADOW_PERSISTENCE_CONTRACT_V2 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import { deriveDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';

function movingDirectFsm(label: string) {
  return { bucketLabelUtc: label, state: 'MOVING' as const, evidenceQuality: 'DIRECT' as const, reason: 'r', flags: [] };
}

function speedRow(label: string, speedKmh: number, quality: 'OK' | 'MISSING' = 'OK') {
  return { bucketLabelUtc: label, speedKmh, quality, estimator: 'C4', flags: [], support: [] };
}

function basePayload(overrides: Partial<DiV0MotionCoreShadowPayloadV1> = {}): DiV0MotionCoreShadowPayloadV1 {
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
    summary: { labelCount: 0, speedNumericCount: 0, eventCount: 0, eventAcceptedCount: 0, eventArtefactSuspectCount: 0, stopEpisodeCount: 0 },
    ...overrides,
  } as DiV0MotionCoreShadowPayloadV1;
}

describe('deriveDs4DrivingExposureV1', () => {
  it('integrates exposure over actual 1s intervals (not assumed Hz)', () => {
    const payload = basePayload({
      fsmLabels: [
        movingDirectFsm('2026-01-01T10:00:00Z'),
        movingDirectFsm('2026-01-01T10:00:01Z'),
        movingDirectFsm('2026-01-01T10:00:02Z'),
        movingDirectFsm('2026-01-01T10:00:03Z'),
      ],
      speeds: [
        speedRow('2026-01-01T10:00:00Z', 36),
        speedRow('2026-01-01T10:00:01Z', 36),
        speedRow('2026-01-01T10:00:02Z', 36),
        speedRow('2026-01-01T10:00:03Z', 36),
      ],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.derivable).toBe(true);
    expect(exposure.exposureSeconds).toBe(3);
    expect(exposure.distanceKm).toBeCloseTo((36 * 3) / 3600, 6);
    expect(exposure.provenance.provenanceVersion).toBe('DS4_ASSESSMENT_DRIVING_EXPOSURE_V2');
    expect(exposure.provenance.speedAuthority).toBe('C4_ONLY');
  });

  it('excludes intervals when either endpoint fails MOVING+DIRECT or usable speed', () => {
    const payload = basePayload({
      fsmLabels: [
        movingDirectFsm('2026-01-01T10:00:00Z'),
        { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'STOPPED', evidenceQuality: 'DIRECT', reason: 'r', flags: [] },
        movingDirectFsm('2026-01-01T10:00:02Z'),
      ],
      speeds: [speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:01Z', 36), speedRow('2026-01-01T10:00:02Z', 36)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.exposureSeconds).toBe(0);
    expect(exposure.derivable).toBe(false);
  });

  it('regression: MOVING/DIRECT → STATIONARY does not integrate the crossing interval', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'STOPPED', evidenceQuality: 'DIRECT', reason: 'r', flags: [] }],
      speeds: [speedRow('2026-01-01T10:00:00Z', 40), speedRow('2026-01-01T10:00:01Z', 0)],
    });
    expect(deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' }).exposureSeconds).toBe(0);
  });

  it('regression: MOVING/DIRECT → UNKNOWN FSM endpoint excludes interval', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), { bucketLabelUtc: '2026-01-01T10:00:01Z', state: 'MOVING', evidenceQuality: 'UNKNOWN', reason: 'r', flags: [] }],
      speeds: [speedRow('2026-01-01T10:00:00Z', 40), speedRow('2026-01-01T10:00:01Z', 40)],
    });
    expect(deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' }).exposureSeconds).toBe(0);
  });

  it('regression: valid speed → invalid speed at next endpoint excludes interval', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 40), speedRow('2026-01-01T10:00:01Z', 40, 'MISSING')],
    });
    expect(deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' }).exposureSeconds).toBe(0);
  });

  it('regression: missing intermediate bucket (gap > maxGapS) does not bridge', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:04Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:04Z', 36)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.exposureSeconds).toBe(0);
    expect(exposure.provenance.excludedGapIntervalCount).toBe(1);
  });

  it('regression: 2s timestamp gap is not credited as observed exposure (1s grid step)', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:02Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:02Z', 36)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.exposureSeconds).toBe(0);
    expect(exposure.distanceKm).toBe(0);
    expect(exposure.provenance.excludedGapIntervalCount).toBe(1);
  });

  it('regression: conflicting duplicate speed labels fail closed (order independent)', () => {
    const build = (speeds: ReturnType<typeof speedRow>[]) =>
      basePayload({
        fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
        speeds,
      });
    for (const speeds of [
      [speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:00Z', 99), speedRow('2026-01-01T10:00:01Z', 36)],
      [speedRow('2026-01-01T10:00:00Z', 99), speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:01Z', 36)],
    ]) {
      const exposure = deriveDs4DrivingExposureV1({ payload: build(speeds), speedAuthority: 'C4_ONLY' });
      expect(exposure.exposureSeconds).toBe(0);
      expect(exposure.distanceKm).toBe(0);
      expect(exposure.provenance.conflictingDuplicateLabelCount).toBeGreaterThan(0);
    }
  });

  it('regression: identical duplicate speed labels collapse deterministically', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:01Z', 36)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.exposureSeconds).toBe(1);
    expect(exposure.distanceKm).toBeCloseTo(36 / 3600, 8);
    expect(exposure.provenance.duplicateLabelCount).toBe(1);
    expect(exposure.provenance.conflictingDuplicateLabelCount).toBe(0);
  });

  it('regression: duplicate timestamps do not inflate exposure', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 36), speedRow('2026-01-01T10:00:00Z', 99), speedRow('2026-01-01T10:00:01Z', 36)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.exposureSeconds).toBe(0);
    expect(exposure.distanceKm).toBe(0);
  });

  it('regression: C5_1_PREFERRED does not substitute c4Speeds when preferred speeds missing', () => {
    const payload = basePayload({
      contract: { ...basePayload().contract, speedAuthority: 'C5_1_PREFERRED' },
      speeds: [],
      c4Speeds: [speedRow('2026-01-01T10:00:00Z', 50), speedRow('2026-01-01T10:00:01Z', 50)],
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C5_1_PREFERRED' });
    expect(exposure.derivable).toBe(false);
    expect(exposure.provenance.canonicalSpeedSeriesMissing).toBe(true);
    expect(exposure.provenance.speedSeriesField).toBe('speeds');
  });

  it('regression: C4_ONLY missing speeds fails closed', () => {
    const payload = basePayload({
      speeds: [],
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.derivable).toBe(false);
    expect(exposure.provenance.canonicalSpeedSeriesMissing).toBe(true);
  });

  it('regression: two valid consecutive moving samples integrate one interval', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 72), speedRow('2026-01-01T10:00:01Z', 72)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C4_ONLY' });
    expect(exposure.exposureSeconds).toBe(1);
    expect(exposure.distanceKm).toBeCloseTo(72 / 3600, 8);
  });

  it('regression: C5_1_PREFERRED provenance partition preserved', () => {
    const payload = basePayload({
      contract: { ...basePayload().contract, speedAuthority: 'C5_1_PREFERRED' },
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 50), speedRow('2026-01-01T10:00:01Z', 50)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: 'C5_1_PREFERRED' });
    expect(exposure.provenance.speedAuthority).toBe('C5_1_PREFERRED');
    expect(exposure.exposureSeconds).toBe(1);
  });

  it('is not derivable without speed authority partition', () => {
    const payload = basePayload({
      fsmLabels: [movingDirectFsm('2026-01-01T10:00:00Z'), movingDirectFsm('2026-01-01T10:00:01Z')],
      speeds: [speedRow('2026-01-01T10:00:00Z', 10), speedRow('2026-01-01T10:00:01Z', 10)],
    });
    const exposure = deriveDs4DrivingExposureV1({ payload, speedAuthority: null });
    expect(exposure.derivable).toBe(false);
    expect(exposure.exposureSeconds).toBe(0);
  });
});
