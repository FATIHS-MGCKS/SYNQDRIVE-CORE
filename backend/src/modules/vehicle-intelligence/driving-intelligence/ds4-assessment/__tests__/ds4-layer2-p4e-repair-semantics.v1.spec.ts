import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
} from '../research/ds4-layer2-p2-pinned-11.attestation.v1';
import { computeDs4Layer2P4bInWindowSpeedEvidenceV1 } from '../research/ds4-layer2-p4b-in-window-speed.v1';
import {
  buildDs4Layer2P4bEventKinematicsEvidenceV1,
  buildDs4Layer2P4bSidecarArtifactsV1,
} from '../research/ds4-layer2-p4b-event-kinematics-evidence.v1';
import type { Ds4Layer2P4bP2AdmissibleEventRowV1 } from '../research/ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import { assertDs4Layer2P4bPreflightV1, loadDs4Layer2P4bP2AdmissibleEventsV1 } from '../research/ds4-layer2-p4b-preflight.v1';
import { createDs4Layer2P4bMapPayloadLoaderV1 } from '../research/ds4-layer2-p4b-payload-loader.v1';
import { DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1 } from '../research/ds4-layer2-p4b-pinned-source-runs.v1';
import { buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1 } from '../research/ds4-layer2-p4b-test-payload-synth.v1';
import {
  buildDs4Layer2P4eEventKinematicsEvidenceV1,
  buildDs4Layer2P4eSidecarArtifactsV1,
  buildDs4Layer2P4eValidationReportMarkdownV1,
} from '../research/ds4-layer2-p4e-event-kinematics-evidence.v1';
import {
  computeDs4Layer2P4eRepairStateEvidenceV1,
  isDs4Layer2P4bLegacyRepairInfluencedV1,
} from '../research/ds4-layer2-p4e-repair-state-evidence.v1';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';

const FIXTURE_P2_DIR = join(__dirname, '../research/fixtures/ds4-layer2-p2-pinned-11');

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function minimalC51Payload(input: {
  startLabel: string;
  endLabel: string;
  speedRepairs?: DiV0MotionCoreShadowPayloadV1['speedRepairs'];
}): DiV0MotionCoreShadowPayloadV1 {
  return {
    contract: {
      algorithmVersions: {
        c4: 't',
        c5_1: 't',
        c5_1ProductionSafety: null,
        c5_1AlgorithmFileSha256: null,
        fsm: 't',
        gapBridgeV1: null,
        fsmAuxBinding: null,
        events: 't',
        bundle: 'bundle-test',
      },
      speedAuthority: 'C5_1_PREFERRED',
      timeSemantics: {
        processingMode: 'POST_TRIP_RETROSPECTIVE',
        c4ValueSupportForwardS:  1,
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
    speeds: [
      {
        bucketLabelUtc: input.startLabel,
        speedKmh: 30,
        quality: 'OK',
        support: [],
        estimator: 'TEST',
        flags: [],
      },
    ],
    speedRepairs: input.speedRepairs,
    fsmLabels: [],
    stopEpisodes: [],
    events: [
      {
        kind: 'ACCELERATION',
        startLabel: input.startLabel,
        endLabel: input.endLabel,
        startSpeedKmh: 30,
        endSpeedKmh: 35,
        deltaKmh: 5,
        quality: 'OK',
        flags: [],
      },
    ],
    summary: {
      labelCount: 1,
      speedNumericCount: 1,
      eventCount: 1,
      eventAcceptedCount: 1,
      eventArtefactSuspectCount: 0,
      stopEpisodeCount: 0,
    },
  };
}

describe('DS4 Layer-2 P4E A1 repair semantics correction', () => {
  it('documents legacy predicate root cause on C5.1 pass-through rows', () => {
    expect(isDs4Layer2P4bLegacyRepairInfluencedV1('PASS_THROUGH_NO_REPAIR')).toBe(true);
    expect(isDs4Layer2P4bLegacyRepairInfluencedV1('REPAIR_ACCEPTED')).toBe(true);
    expect(isDs4Layer2P4bLegacyRepairInfluencedV1('REPAIR_REJECTED')).toBe(true);
    expect(isDs4Layer2P4bLegacyRepairInfluencedV1('NONE')).toBe(false);
  });

  it('negative control: C5.1 without accepted repair — legacy true, P4E accepted false', () => {
    const payload = minimalC51Payload({
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      speedRepairs: [
        {
          bucketLabelUtc: '2026-10-28T16:31:19Z',
          repairState: 'PASS_THROUGH_NO_REPAIR',
          c4SpeedKmh: 30,
          c4Quality: 'OK',
          preferredSpeedKmh: 30,
          preferredQuality: 'OK',
          rejectionReason: null,
          q5Evidence: null,
          q6Evidence: null,
        },
      ],
    });
    const legacy = computeDs4Layer2P4bInWindowSpeedEvidenceV1({
      payload,
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      durationTier: 'BIN_ONLY',
      steps: 2,
      coverageRatio: 1,
    });
    const p4e = computeDs4Layer2P4eRepairStateEvidenceV1({
      payload,
      payloadSpeedAuthority: 'C5_1_PREFERRED',
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      durationTier: 'BIN_ONLY',
      kinematicLimitations: [],
    });
    expect(legacy.repairInfluenced).toBe(true);
    expect(p4e.repairAcceptedInWindow).toBe(false);
    expect(p4e.repairInfluencedLegacy).toBe(true);
    expect(p4e.histogram.repairPassThroughInWindow).toBe(1);
  });

  it('negative control: accepted repair inside window sets accepted annotation only', () => {
    const payload = minimalC51Payload({
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      speedRepairs: [
        {
          bucketLabelUtc: '2026-10-28T16:31:19Z',
          repairState: 'REPAIR_ACCEPTED',
          c4SpeedKmh: 30,
          c4Quality: 'OK',
          preferredSpeedKmh: 32,
          preferredQuality: 'REPAIRED',
          rejectionReason: null,
          q5Evidence: null,
          q6Evidence: null,
        },
      ],
    });
    const p4e = computeDs4Layer2P4eRepairStateEvidenceV1({
      payload,
      payloadSpeedAuthority: 'C5_1_PREFERRED',
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      durationTier: 'FULL_ELIGIBLE',
      kinematicLimitations: [],
    });
    expect(p4e.repairAcceptedInWindow).toBe(true);
    expect(p4e.histogram.repairAcceptedInWindow).toBe(1);
    expect(p4e.limitations).toContain('REPAIR_ACCEPTED_IN_WINDOW');
  });

  it('negative control: rejected repair inside window yields suspicion not accepted', () => {
    const payload = minimalC51Payload({
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      speedRepairs: [
        {
          bucketLabelUtc: '2026-10-28T16:31:20Z',
          repairState: 'REPAIR_REJECTED',
          c4SpeedKmh: 30,
          c4Quality: 'OK',
          preferredSpeedKmh: null,
          preferredQuality: 'REPAIR_REJECTED',
          rejectionReason: 'q5_fail',
          q5Evidence: 'fail',
          q6Evidence: null,
        },
      ],
    });
    const p4e = computeDs4Layer2P4eRepairStateEvidenceV1({
      payload,
      payloadSpeedAuthority: 'C5_1_PREFERRED',
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      durationTier: 'FULL_ELIGIBLE',
      kinematicLimitations: [],
    });
    expect(p4e.repairAcceptedInWindow).toBe(false);
    expect(p4e.repairSuspicionInWindow).toBe(true);
    expect(p4e.limitations).toContain('REPAIR_SUSPICION_IN_WINDOW');
  });

  it('negative control: accepted repair outside event window does not annotate event', () => {
    const payload = minimalC51Payload({
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      speedRepairs: [
        {
          bucketLabelUtc: '2026-10-28T16:31:25Z',
          repairState: 'REPAIR_ACCEPTED',
          c4SpeedKmh: 30,
          c4Quality: 'OK',
          preferredSpeedKmh: 32,
          preferredQuality: 'REPAIRED',
          rejectionReason: null,
          q5Evidence: null,
          q6Evidence: null,
        },
      ],
    });
    const p4e = computeDs4Layer2P4eRepairStateEvidenceV1({
      payload,
      payloadSpeedAuthority: 'C5_1_PREFERRED',
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      durationTier: 'FULL_ELIGIBLE',
      kinematicLimitations: [],
    });
    expect(p4e.repairAcceptedInWindow).toBe(false);
    expect(p4e.histogram.inWindowRepairRowCount).toBe(0);
  });

  it('negative control: missing speedRepairs on C5.1 marks payload rows missing', () => {
    const payload = minimalC51Payload({
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
    });
    delete payload.speedRepairs;
    const p4e = computeDs4Layer2P4eRepairStateEvidenceV1({
      payload,
      payloadSpeedAuthority: 'C5_1_PREFERRED',
      startLabel: '2026-10-28T16:31:19Z',
      endLabel: '2026-10-28T16:31:21Z',
      durationTier: 'FULL_ELIGIBLE',
      kinematicLimitations: [],
    });
    expect(p4e.repairEvidenceAvailability).toBe('PAYLOAD_ROWS_MISSING');
    expect(p4e.repairAcceptedInWindow).toBe(false);
  });

  it('reproduces legacy 40 flags on synthetic C5.1 pinned payloads with pass-through grid rows', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events, {
      includeWindowSpeedSamples: true,
      c51PassThroughGridRepairRows: true,
    });
    const built = await buildDs4Layer2P4eEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    expect(built.evidenceRows).toHaveLength(129);
    const legacyTrue = built.evidenceRows.filter((r) => r.repairInfluencedLegacy).length;
    expect(legacyTrue).toBe(40);
    const c51 = built.evidenceRows.filter((r) => r.payloadSpeedAuthority === 'C5_1_PREFERRED').length;
    expect(c51).toBe(40);
    expect(built.evidenceRows.every((r) => r.repairInfluencedLegacy === (r.payloadSpeedAuthority === 'C5_1_PREFERRED'))).toBe(
      true,
    );
  });

  it('preserves P2 checksums and P4B sidecar reference checksum path', async () => {
    const before = sha256File(join(FIXTURE_P2_DIR, 'p2_longitudinal_events.csv'));
    assertDs4Layer2P4bPreflightV1({ p2Dir: FIXTURE_P2_DIR, requireP3cOnHead: false });
    const after = sha256File(join(FIXTURE_P2_DIR, 'p2_longitudinal_events.csv'));
    expect(before).toBe(after);
    expect(before).toBe(DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1['p2_longitudinal_events.csv']);

    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR).slice(0, 5);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events);
    const built = await buildDs4Layer2P4eEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    const artifacts = buildDs4Layer2P4eSidecarArtifactsV1({
      p4eEvaluationCodeSha: 'testsha',
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p3cMergeShaReference: '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9',
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      builtAtUtc: new Date('2026-10-31T12:00:00.000Z'),
      evidenceRows: built.evidenceRows,
      joinExclusions: built.joinExclusions,
      summary: built.summary,
      repairHistogram: built.repairHistogram,
      pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
      validationReportMarkdown: '# test\n',
    });
    expect(artifacts.legacyP4bArtifacts.fileChecksums['p4b_event_speed_evidence.csv']).toBeDefined();
    expect(artifacts.manifest.legacyP4bSidecarReference).toBeDefined();
  });

  it('does not change kinematic window fields relative to legacy P4B builder', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR).slice(0, 12);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events, {
      includeWindowSpeedSamples: true,
      c51PassThroughGridRepairRows: true,
    });
    const legacy = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    const p4e = await buildDs4Layer2P4eEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    for (const leg of legacy.evidenceRows) {
      const neu = p4e.evidenceRows.find(
        (r) => r.tripId === leg.tripId && r.eventIndex === leg.eventIndex && r.sourceMotionRunId === leg.sourceMotionRunId,
      );
      expect(neu).toBeDefined();
      expect(neu!.startSpeedKmh).toBe(leg.startSpeedKmh);
      expect(neu!.windowMeanSpeedKmh).toBe(leg.windowMeanSpeedKmh);
      expect(neu!.repairInfluenced).toBe(leg.repairInfluenced);
    }
  });

  it('builds deterministic P4E artifact checksums', async () => {
    const events = loadDs4Layer2P4bP2AdmissibleEventsV1(FIXTURE_P2_DIR).slice(0, 8);
    const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events, { c51PassThroughGridRepairRows: true });
    const built = await buildDs4Layer2P4eEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents: events,
      payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
    });
    const report = buildDs4Layer2P4eValidationReportMarkdownV1({
      baseSha: 'base',
      evaluationCodeSha: 'eval',
      builtAtUtc: new Date('2026-10-31T12:00:00.000Z'),
      repairHistogram: built.repairHistogram,
      legacyFlagCount: built.evidenceRows.filter((r) => r.repairInfluencedLegacy).length,
      legacyMatchesAuthority: true,
      acceptedInWindowEventCount: built.evidenceRows.filter((r) => r.repairAcceptedInWindow).length,
      p2ChecksumsUnchanged: true,
      exactJoinCount: built.evidenceRows.length,
      negativeControlsPassed: true,
      realPayloadSource: 'SYNTHETIC_TEST_HARNESS',
    });
    const artifactsA = buildDs4Layer2P4eSidecarArtifactsV1({
      p4eEvaluationCodeSha: 'abc123',
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p3cMergeShaReference: '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9',
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      builtAtUtc: new Date('2026-10-31T12:00:00.000Z'),
      evidenceRows: built.evidenceRows,
      joinExclusions: built.joinExclusions,
      summary: built.summary,
      repairHistogram: built.repairHistogram,
      pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
      validationReportMarkdown: report,
    });
    const artifactsB = buildDs4Layer2P4eSidecarArtifactsV1({
      p4eEvaluationCodeSha: 'abc123',
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p3cMergeShaReference: '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9',
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      builtAtUtc: new Date('2026-10-31T12:00:00.000Z'),
      evidenceRows: built.evidenceRows,
      joinExclusions: built.joinExclusions,
      summary: built.summary,
      repairHistogram: built.repairHistogram,
      pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
      validationReportMarkdown: report,
    });
    expect(artifactsA.fileChecksums).toEqual(artifactsB.fileChecksums);
    expect(artifactsA.manifest.manifestChecksumSha256).toBe(artifactsB.manifest.manifestChecksumSha256);
  });
});
