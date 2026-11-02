import type { DiV0MotionCoreShadowPersistedEventRow } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type {
  Ds4Layer2P4bJoinExclusionRowV1,
  Ds4Layer2P4bJoinFailureReasonV1,
  Ds4Layer2P4bP2AdmissibleEventRowV1,
} from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import type { Ds4Layer2P4bLoadedMotionPayloadV1 } from './ds4-layer2-p4b-payload-loader.v1';

function normalizeLabelUtc(label: string): string {
  return label.endsWith('Z') ? label : `${label.replace(/(\.\d{3})\d+Z$/, '$1Z')}`;
}

function labelsMatch(a: string, b: string): boolean {
  return normalizeLabelUtc(a) === normalizeLabelUtc(b);
}

function kindMatches(p2Kind: string, motionKind: string): boolean {
  return p2Kind.toUpperCase() === motionKind.toUpperCase();
}

export type Ds4Layer2P4bSuccessfulEventJoinV1 = {
  p2Event: Ds4Layer2P4bP2AdmissibleEventRowV1;
  motionEvent: DiV0MotionCoreShadowPersistedEventRow;
  loaded: Ds4Layer2P4bLoadedMotionPayloadV1;
};

export function joinDs4Layer2P4bP2EventToMotionPayloadV1(input: {
  p2Event: Ds4Layer2P4bP2AdmissibleEventRowV1;
  loaded: Ds4Layer2P4bLoadedMotionPayloadV1;
}): { ok: true; join: Ds4Layer2P4bSuccessfulEventJoinV1 } | { ok: false; exclusion: Ds4Layer2P4bJoinExclusionRowV1 } {
  const { p2Event, loaded } = input;
  const events = loaded.payload.events ?? [];
  if (p2Event.eventIndex < 0 || p2Event.eventIndex >= events.length) {
    return exclusion(p2Event, 'EVENT_INDEX_OUT_OF_RANGE', `index ${p2Event.eventIndex}, len ${events.length}`);
  }
  const motionEvent = events[p2Event.eventIndex]!;
  if (!kindMatches(p2Event.eventKind, motionEvent.kind)) {
    return exclusion(
      p2Event,
      'KIND_MISMATCH',
      `P2 ${p2Event.eventKind} != motion ${motionEvent.kind}`,
    );
  }
  if (!labelsMatch(p2Event.startLabelUtc, motionEvent.startLabel)) {
    return exclusion(
      p2Event,
      'START_LABEL_MISMATCH',
      `P2 ${p2Event.startLabelUtc} != motion ${motionEvent.startLabel}`,
    );
  }
  if (!labelsMatch(p2Event.endLabelUtc, motionEvent.endLabel)) {
    return exclusion(
      p2Event,
      'END_LABEL_MISMATCH',
      `P2 ${p2Event.endLabelUtc} != motion ${motionEvent.endLabel}`,
    );
  }

  const startOk = Number.isFinite(motionEvent.startSpeedKmh);
  const endOk = Number.isFinite(motionEvent.endSpeedKmh);
  if (!startOk || !endOk) {
    return exclusion(p2Event, 'MISSING_BOUNDARY_SPEED', `start=${motionEvent.startSpeedKmh} end=${motionEvent.endSpeedKmh}`);
  }

  return {
    ok: true,
    join: { p2Event, motionEvent, loaded },
  };
}

function exclusion(
  p2Event: Ds4Layer2P4bP2AdmissibleEventRowV1,
  failureReason: Ds4Layer2P4bJoinFailureReasonV1,
  detail: string,
): { ok: false; exclusion: Ds4Layer2P4bJoinExclusionRowV1 } {
  return {
    ok: false,
    exclusion: {
      tripId: p2Event.tripId,
      sourceMotionRunId: p2Event.sourceMotionRunId,
      eventIndex: p2Event.eventIndex,
      offlineReconstructionKey: p2Event.offlineReconstructionKey,
      failureReason,
      detail,
    },
  };
}

export function detectDuplicateP4bJoinKeysV1(
  events: readonly Ds4Layer2P4bP2AdmissibleEventRowV1[],
): Ds4Layer2P4bJoinExclusionRowV1[] {
  const seen = new Map<string, Ds4Layer2P4bP2AdmissibleEventRowV1>();
  const out: Ds4Layer2P4bJoinExclusionRowV1[] = [];
  for (const ev of events) {
    const key = `${ev.tripId}|${ev.sourceMotionRunId}|${ev.eventIndex}`;
    if (seen.has(key)) {
      out.push({
        tripId: ev.tripId,
        sourceMotionRunId: ev.sourceMotionRunId,
        eventIndex: ev.eventIndex,
        offlineReconstructionKey: ev.offlineReconstructionKey,
        failureReason: 'DUPLICATE_EVENT_INDEX',
        detail: `Duplicate join key ${key}`,
      });
    } else {
      seen.set(key, ev);
    }
  }
  return out;
}
