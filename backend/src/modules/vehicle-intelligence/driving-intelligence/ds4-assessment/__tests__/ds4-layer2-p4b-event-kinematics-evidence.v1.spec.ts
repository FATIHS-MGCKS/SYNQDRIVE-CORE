import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
} from '../research/ds4-layer2-p2-pinned-11.attestation.v1';
import {
  buildDs4Layer2P4bEventKinematicsEvidenceV1,
  buildDs4Layer2P4bSidecarArtifactsV1,
} from '../research/ds4-layer2-p4b-event-kinematics-evidence.v1';
import { joinDs4Layer2P4bP2EventToMotionPayloadV1 } from '../research/ds4-layer2-p4b-event-join.v1';
import {
  createDs4Layer2P4bMapPayloadLoaderV1,
  type Ds4Layer2P4bLoadedMotionPayloadV1,
} from '../research/ds4-layer2-p4b-payload-loader.v1';
import {
  assertDs4Layer2P4bPreflightV1,
  loadDs4Layer2P4bP2AdmissibleEventsV1,
} from '../research/ds4-layer2-p4b-preflight.v1';
import { DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1 } from '../research/ds4-layer2-p4b-pinned-source-runs.v1';
import { buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1 } from '../research/ds4-layer2-p4b-test-payload-synth.v1';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4Layer2P4bP2AdmissibleEventRowV1 } from '../research/ds4-layer2-p4b-event-kinematics-evidence.v1.contract';

const FIXTURE_P2_DIR = join(__dirname, '../research/fixtures/ds4-layer2-p2-pinned-11');

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function minimalPayload(event: {
  kind: string;
  startLabel: string;
  endLabel: string;
  startSpeedKmh: number;
  endSpeedKmh: number;
}): DiV0MotionCoreShadowPayloadV1 {
  return {
    contract: {
      algorithmVersions: {
        c4: 't',
        c5_1: null,
        c5_1ProductionSafety: null,
        c5_1AlgorithmFileSha256: null,
        fsm: 't',
        gapBridgeV1: null,
        fsmAuxBinding: null,
        events: 't',
        bundle: 'bundle-test',
      },
      speedAuthority: 'C4_ONLY',
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS: 1,
        c4FullFinalizationForwardS: 1,
        fsmMode: 'RETROSPECTIVE',
        eventFinalizationNote: 't',
        computedAtUtc: '2026-01-01T00:00:00Z',
      },
      sparse: { channelOutcome: null, comparable: true, sampleCount: 0, samples: [], limitations: [] },
      comparisonHints: {
        artefactSuspectExcludedFromAcceptedManoeuvreCounts: true,
        inferredNeverPromotedToDirect: true,
        unknownNotCountedAsConfirmedStandstill: true,
      },
    },
    speeds: [],
    fsmLabels: [],
    stopEpisodes: [],
    events: [
      {
        kind: event.kind,
        startLabel: event.startLabel,
        endLabel: event.endLabel,
        startSpeedKmh: event.startSpeedKmh,
        endSpeedKmh: event.endSpeedKmh,
        deltaKmh: event.endSpeedKmh - event.startSpeedKmh,
        quality: 'OK',
        flags: [],
      },
    ],
    summary: {
      labelCount: 1,
      speedNumericCount: 0,
      eventCount: 1,
      eventAcceptedCount: 1,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
  };
}

describe('DS4 Layer-2 P4B event kinematics evidence sidecar', () => {
  it('passes pinned P2 preflight without mutating P2 checksums', () => {
    const before = sha256File(join(FIXTURE_P2_DIR, 'p2_longitudinal_events.csv'));
    assertDs4Layer2P4bPreflightV1({ p2Dir: FIXTURE_P2_DIR, requireP3cOnHead: false });
    const after = sha256File(join(FIXTURE_P2_DIR, 'p2_longitudinal_events.csv'));
    expect(before).toBe(after);
    expect(before).toBe(DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1['p2_longitudinal_events.csv']);
  });

  it('rejects event index out of range', () => {
    const p2Event: Ds4Layer2P4bP2AdmissibleEventRowV1 = {
      offlineReconstructionKey: 'k',
      tripId: '004f9579-2875-42f2-8aa7-e82c343c954e',
      vehicleId: 'v',
      sourceMotionRunId: '1787be35-2e5e-42ef-bbf5-a12ee70b92b6',
      eventIndex: 1,
      eventKind: 'ACCELERATION',
      startLabelUtc: '2026-10-28T16:31:19Z',
      endLabelUtc: '2026-10-28T16:31:21Z',
      durationS: 2,
      steps: 2,
      coverageRatio: 1,
      durationTier: 'BIN_ONLY',
      eligibilityClassification: 'ADMISSIBLE_BIN_ONLY',
      speedAuthority: 'C4_ONLY',
    };
    const loaded: Ds4Layer2P4bLoadedMotionPayloadV1 = {
      payload: minimalPayload({
        kind: 'ACCELERATION',
        startLabel: p2Event.startLabelUtc,
        endLabel: p2Event.endLabelUtc,
        startSpeedKmh: 10,
        endSpeedKmh: 12,
      }),
      sourceMotionRunId: p2Event.sourceMotionRunId,
      contentFingerprint:
        DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[p2Event.tripId as keyof typeof DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1]
          .contentFingerprint,
      speedAuthority: 'C4_ONLY',
      sourceMotionRevision: 'bundle-test',
      shadowBundleVersion: 'test',
    };
    const joined = joinDs4Layer2P4bP2EventToMotionPayloadV1({ p2Event: { ...p2Event, eventIndex: 5 }, loaded });
    expect(joined.ok).toBe(false);
    if (!joined.ok) expect(joined.exclusion.failureReason).toBe('EVENT_INDEX_OUT_OF_RANGE');
  });

  it('rejects direction and timestamp mismatches', () => {
    const p2Event: Ds4Layer2P4bP2AdmissibleEventRowV1 = {
      offlineReconstructionKey: 'k',
      tripId: '004f9579-2875-42f2-8aa7-e82c343c954e',
      vehicleId: 'v',
      sourceMotionRunId: '1787be35-2e5e-42ef-bbf5-a12ee70b92b6',
      eventIndex: 0,
      eventKind: 'ACCELERATION',
      startLabelUtc: '2026-10-28T16:31:19Z',
      endLabelUtc: '2026-10-28T16:31:21Z',
      durationS: 2,
      steps: 2,
      coverageRatio: 1,
      durationTier: 'BIN_ONLY',
      eligibilityClassification: 'ADMISSIBLE_BIN_ONLY',
      speedAuthority: 'C4_ONLY',
    };
    const loaded: Ds4Layer2P4bLoadedMotionPayloadV1 = {
      payload: minimalPayload({
        kind: 'DECELERATION',
        startLabel: '2026-10-28T16:31:19Z',
        endLabel: '2026-10-28T16:31:21Z',
        startSpeedKmh: 10,
        endSpeedKmh: 12,
      }),
      sourceMotionRunId: p2Event.sourceMotionRunId,
      contentFingerprint:
        DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[p2Event.tripId as keyof typeof DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1]
          .contentFingerprint,
      speedAuthority: 'C4_ONLY',
      sourceMotionRevision: 'bundle-test',
      shadowBundleVersion: null,
    };
    const kindFail = joinDs4Layer2P4bP2EventToMotionPayloadV1({ p2Event, loaded });
    expect(kindFail.ok).toBe(false);
    if (!kindFail.ok) expect(kindFail.exclusion.failureReason).toBe('KIND_MISMATCH');

    loaded.payload.events[0]!.startLabel = '2026-10-28T16:31:20Z';
    const tsFail = joinDs4Layer2P4bP2EventToMotionPayloadV1({
      p2Event: { ...p2Event, eventKind: 'DECELERATION' },
      loaded,
    });
    expect(tsFail.ok).toBe(false);
    if (!tsFail.ok) expect(tsFail.exclusion.failureReason).toBe('START_LABEL_MISMATCH');
  });

  it('rejects missing boundary speeds and missing payload via loader', async () => {
    const p2Event: Ds4Layer2P4bP2AdmissibleEventRowV1 = {
      offlineReconstructionKey: 'k',
      tripId: '004f9579-2875-42f2-8aa7-e82c343c954e',
      vehicleId: 'v',
      sourceMotionRunId: '1787be35-2e5e-42ef-bbf5-a12ee70b92b6',
      eventIndex: 0,
      eventKind: 'ACCELERATION',
      startLabelUtc: '2026-10-28T16:31:19Z',
      endLabelUtc: '2026-10-28T16:31:21Z',
      durationS: 2,
      steps: 2,
      coverageRatio: 1,
      durationTier: 'BIN_ONLY',
      eligibilityClassification: 'ADMISSIBLE_BIN_ONLY',
      speedAuthority: 'C4_ONLY',
    };
    const loaded: Ds4Layer2P4bLoadedMotionPayloadV1 = {
      payload: minimalPayload({
        kind: 'ACCELERATION',
        startLabel: p2Event.startLabelUtc,
        endLabel: p2Event.endLabelUtc,
        startSpeedKmh: Number.NaN,
        endSpeedKmh: 12,
      }),
      sourceMotionRunId: p2Event.sourceMotionRunId,
      contentFingerprint:
        DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[p2Event.tripId as keyof typeof DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1]
          .contentFingerprint,
      speedAuthority: 'C4_ONLY',
      sourceMotionRevision: 'bundle-test',
      shadowBundleVersion: null,
    };
    const boundaryFail = joinDs4Layer2P4bP2EventToMotionPayloadV1({ p2Event, loaded });
    expect(boundaryFail.ok).toBe(false);
    if (!boundaryFail.ok) expect(boundaryFail.exclusion.failureReason).toBe('MISSING_BOUNDARY_SPEED');

    const loader = createDs4Layer2P4bMapPayloadLoaderV1(new Map());
    const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: [p2Event],
      payloadLoader: loader,
    });
    expect(built.evidenceRows).toHaveLength(0);
    expect(built.joinExclusions[0]?.failureReason).toBe('MISSING_PAYLOAD');
  });

  it('never reconstructs peak acceleration from flags or derivatives', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR).slice(0, 5);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events, {
      includeWindowSpeedSamples: true,
    });
    for (const p of payloads.values()) {
      for (const ev of p.payload.events) {
        (ev as { intensity?: { peakAccelMps2?: number } }).intensity = { peakAccelMps2: 99 };
      }
    }
    const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    expect(built.evidenceRows.every((r) => r.peakAccelMps2 === null)).toBe(true);
    expect(built.evidenceRows.every((r) => r.peakUnavailabilityReason === 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT')).toBe(
      true,
    );
  });

  it('accounts for all 129 admissible events with synthetic pinned payloads', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR);
    expect(events).toHaveLength(DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events, {
      includeWindowSpeedSamples: true,
    });
    const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    expect(built.summary.exactJoinCount).toBe(129);
    expect(built.summary.failedJoinCount).toBe(0);
    expect(built.summary.eventsAccounted).toBe(129);
    expect(built.evidenceRows).toHaveLength(129);
  });

  it('marks BIN_ONLY window limitations and repair influence without interpolation', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR).filter((e) => e.durationTier === 'BIN_ONLY');
    expect(events.length).toBeGreaterThan(0);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events.slice(0, 3), {
      includeWindowSpeedSamples: false,
      repairInWindow: true,
    });
    const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events.slice(0, 3),
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    for (const row of built.evidenceRows) {
      expect(row.durationTier).toBe('BIN_ONLY');
      const limitations = JSON.parse(row.windowLimitationReasonsJson) as string[];
      expect(limitations).toContain('BIN_ONLY_SPARSE_SUPPORT');
    }
    expect(built.evidenceRows.some((r) => r.repairInfluenced)).toBe(true);
  });

  it('produces deterministic sidecar checksums', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR).slice(0, 10);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events);
    const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    const artifactsA = buildDs4Layer2P4bSidecarArtifactsV1({
      p4bEvaluationCodeSha: 'abc123',
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p3cMergeShaReference: '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9',
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      builtAtUtc: new Date('2026-10-31T12:00:00.000Z'),
      evidenceRows: built.evidenceRows,
      joinExclusions: built.joinExclusions,
      summary: built.summary,
      pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
    });
    const artifactsB = buildDs4Layer2P4bSidecarArtifactsV1({
      p4bEvaluationCodeSha: 'abc123',
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p3cMergeShaReference: '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9',
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      builtAtUtc: new Date('2026-10-31T12:00:00.000Z'),
      evidenceRows: built.evidenceRows,
      joinExclusions: built.joinExclusions,
      summary: built.summary,
      pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
    });
    expect(artifactsA.fileChecksums).toEqual(artifactsB.fileChecksums);
    expect(artifactsA.manifest.manifestChecksumSha256).toBe(artifactsB.manifest.manifestChecksumSha256);
  });

  it('rejects fingerprint mismatch on exact source-run identity', async () => {
    const ev = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR)[0]!;
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1([ev]);
    const loaded = payloads.get(ev.sourceMotionRunId)!;
    loaded.contentFingerprint = 'deadbeef';
    const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: [ev],
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    expect(built.joinExclusions[0]?.failureReason).toBe('CONTENT_FINGERPRINT_MISMATCH');
  });
});
