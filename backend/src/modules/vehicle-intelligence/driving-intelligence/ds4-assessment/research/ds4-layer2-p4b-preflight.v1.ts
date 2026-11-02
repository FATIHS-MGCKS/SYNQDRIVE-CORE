import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
} from './ds4-layer2-p2-pinned-11.attestation.v1';
import {
  assertDs4Layer2P2Pinned11PreflightV1,
  loadDs4Layer2P2PinnedInputsFromDirV1,
  parseCsvWithHeader,
} from './ds4-layer2-p3c-p2-input.v1';
import type { Ds4Layer2P4bP2AdmissibleEventRowV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import { DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1 } from './ds4-layer2-p4b-pinned-source-runs.v1';

/** P3C merge on main — P4B sidecar assumes persisted Motion V2 payloads from this lineage. */
export const DS4_LAYER2_P3C_MERGE_SHA_REFERENCE_V1 =
  '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9' as const;

export function assertGitAncestorCommitV1(input: { repoRoot: string; ancestorSha: string }): void {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', input.ancestorSha, 'HEAD'], {
      cwd: input.repoRoot,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(
      `Git HEAD does not contain required ancestor ${input.ancestorSha} (P3C merge baseline for P4B)`,
    );
  }
}

export function loadDs4Layer2P4bP2AdmissibleEventsV1(p2Dir: string): Ds4Layer2P4bP2AdmissibleEventRowV1[] {
  assertDs4Layer2P2Pinned11PreflightV1(p2Dir);
  const { admissibleEvents } = loadDs4Layer2P2PinnedInputsFromDirV1(p2Dir);
  const eventsCsv = parseCsvWithHeader(readFileSync(join(p2Dir, 'p2_longitudinal_events.csv'), 'utf8'));
  const byKey = new Map(
    eventsCsv.rows.map((r) => [
      `${r.trip_id}|${r.source_motion_run_id}|${r.event_index}`,
      r,
    ]),
  );

  return admissibleEvents.map((ev) => {
    const key = `${ev.tripId}|${ev.sourceMotionRunId}|${ev.eventIndex}`;
    const row = byKey.get(key);
    if (!row) {
      throw new Error(`P4B: missing P2 longitudinal row for join key ${key}`);
    }
    const pinned = DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[ev.tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number]];
    if (!pinned) {
      throw new Error(`P4B: trip ${ev.tripId} not in pinned source-run map`);
    }
    if (ev.sourceMotionRunId !== pinned.sourceMotionRunId) {
      throw new Error(
        `P4B: P2 source_motion_run_id ${ev.sourceMotionRunId} != pinned ${pinned.sourceMotionRunId} for trip ${ev.tripId}`,
      );
    }
    return {
      offlineReconstructionKey: ev.offlineReconstructionKey,
      tripId: ev.tripId,
      vehicleId: ev.vehicleId,
      sourceMotionRunId: ev.sourceMotionRunId,
      eventIndex: ev.eventIndex,
      eventKind: ev.eventKind,
      startLabelUtc: ev.startLabelUtc,
      endLabelUtc: ev.endLabelUtc,
      durationS: ev.durationS,
      steps: row.steps === '' ? null : Number(row.steps),
      coverageRatio: row.coverage_ratio === '' ? null : Number(row.coverage_ratio),
      durationTier: row.duration_tier,
      eligibilityClassification: ev.eligibilityClassification,
      speedAuthority: ev.speedAuthority,
    };
  });
}

export function assertDs4Layer2P4bPinnedSourceRunIdentityV1(
  events: readonly Ds4Layer2P4bP2AdmissibleEventRowV1[],
): void {
  if (events.length !== DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1) {
    throw new Error(
      `P4B: expected ${DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1} admissible events, got ${events.length}`,
    );
  }
  const seen = new Set<string>();
  for (const ev of events) {
    const joinKey = `${ev.tripId}|${ev.sourceMotionRunId}|${ev.eventIndex}`;
    if (seen.has(joinKey)) {
      throw new Error(`P4B preflight: duplicate P2 join key ${joinKey}`);
    }
    seen.add(joinKey);
    const pinned =
      DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[
        ev.tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number]
      ];
    if (ev.sourceMotionRunId !== pinned.sourceMotionRunId) {
      throw new Error(`P4B: source run drift for trip ${ev.tripId}`);
    }
  }
}

export function assertDs4Layer2P4bPreflightV1(input: {
  p2Dir: string;
  repoRoot?: string;
  requireP3cOnHead?: boolean;
}): {
  p2EvaluationCodeSha: string;
  admissibleEventCount: number;
} {
  const pre = assertDs4Layer2P2Pinned11PreflightV1(input.p2Dir);
  if (pre.p2EvaluationCodeSha !== DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1) {
    throw new Error('P4B: unexpected P2 evaluation SHA');
  }
  const events = loadDs4Layer2P4bP2AdmissibleEventsV1(input.p2Dir);
  assertDs4Layer2P4bPinnedSourceRunIdentityV1(events);
  if (input.requireP3cOnHead !== false && input.repoRoot) {
    assertGitAncestorCommitV1({
      repoRoot: input.repoRoot,
      ancestorSha: DS4_LAYER2_P3C_MERGE_SHA_REFERENCE_V1,
    });
  }
  return { p2EvaluationCodeSha: pre.p2EvaluationCodeSha, admissibleEventCount: events.length };
}
