import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { MotionFsmState, MotionFsmStopEpisode } from '../../core/kinematics/motion-fsm';
import { parseBucketLabelMs } from '../../core/kinematics/motion-core-grid';
import { filterW0SyntheticResearchAdmittedEventsV1 } from './ds4-dbi-w0-synthetic-event-hygiene.v1';

/**
 * Rich-enough synthetic payload for W0 D4/D5/D6: consecutive 1s labels on MOVING_DIRECT intersection,
 * DIRECT stop episodes, and FSM timeline. Events are hygiene-filtered (no P2 index placeholders).
 */
export function enrichSyntheticPayloadForW0V1(
  _tripId: string,
  base: DiV0MotionCoreShadowPayloadV1,
  tripMeta: {
    exposureSecondsEs: number;
  },
): DiV0MotionCoreShadowPayloadV1 {
  const admitted = filterW0SyntheticResearchAdmittedEventsV1(base.events);
  const eventEdgesMs =
    admitted.length > 0
      ? admitted.flatMap((e) => [parseBucketLabelMs(e.startLabel), parseBucketLabelMs(e.endLabel)])
      : [parseBucketLabelMs('2026-10-28T00:00:00Z')];
  const tEventMin = Math.min(...eventEdgesMs);
  const tEventMax = Math.max(...eventEdgesMs);
  const padStartMs = tEventMin - 120_000;
  const esSeconds = Math.max(
    1,
    Math.round(tripMeta.exposureSecondsEs),
    admitted.length > 0 ? Math.ceil((tEventMax - tEventMin) / 1000) + 240 : Math.round(tripMeta.exposureSecondsEs),
  );

  const stopWindows: { startMs: number; endMs: number }[] = [];
  for (const e of admitted) {
    if (e.kind !== 'DECELERATION') {
      continue;
    }
    const stopStartMs = parseBucketLabelMs(e.endLabel) + 1000;
    const stopEndMs = stopStartMs + 4000;
    stopWindows.push({ startMs: stopStartMs, endMs: stopEndMs });
  }

  const speeds: DiV0MotionCoreShadowPayloadV1['speeds'] = [];
  const fsmLabels: DiV0MotionCoreShadowPayloadV1['fsmLabels'] = [];
  for (let s = 0; s < esSeconds; s += 1) {
    const t = padStartMs + s * 1000;
    const label = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

    const inStop = stopWindows.some((w) => t >= w.startMs && t <= w.endMs);
    const inManeuvre = admitted.some((e) => {
      const a = parseBucketLabelMs(e.startLabel);
      const b = parseBucketLabelMs(e.endLabel);
      return t >= a && t <= b;
    });

    let speedKmh = 32 + (s % 5);
    let state: MotionFsmState = 'MOVING';
    let evidenceQuality: 'DIRECT' | 'INFERRED' = 'DIRECT';
    if (inStop) {
      speedKmh = 0;
      state = 'STATIONARY';
      evidenceQuality = 'DIRECT';
    } else if (inManeuvre) {
      state = 'MOVING';
      speedKmh = 30 + ((s % 11) - 5);
      evidenceQuality = 'DIRECT';
    } else {
      state = 'MOVING';
      speedKmh = 36 + (s % 4);
      evidenceQuality = 'DIRECT';
    }

    speeds.push({
      bucketLabelUtc: label,
      speedKmh,
      quality: 'OK',
      support: [],
      estimator: 'W0_SYNTH',
      flags: [],
    });
    fsmLabels.push({
      bucketLabelUtc: label,
      state,
      evidenceQuality,
      reason: 'W0_SYNTH',
      flags: [],
    });
  }

  const stopEpisodes: MotionFsmStopEpisode[] = [];
  let tripCounter = 0;
  for (const w of stopWindows) {
    const startLab = new Date(w.startMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endLab = new Date(w.endMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    stopEpisodes.push({
      trip: tripCounter,
      mode: 'RETROSPECTIVE',
      startEarliest: startLab,
      startLatest: startLab,
      endEarliest: endLab,
      endLatest: endLab,
      minDurationS: 5,
      maxDurationS: 5,
      evidenceQuality: 'DIRECT',
      openEnd: false,
      labels: 5,
      directLabels: 5,
      inferredLabels: 0,
      indeterminateLabels: 0,
      observedLabels: 5,
      gapLabels: 0,
      lastEvidenceLabel: endLab,
      observedMinDurationS: 5,
      hysteresisBandLabels: 0,
      firstStationarySource: 'C4_OK',
      firstStationaryC4Quality: 'OK',
    });
    tripCounter += 1;
  }

  const okEvents = admitted.filter((e) => e.quality === 'OK');
  const artefactCount = admitted.length - okEvents.length;

  return {
    ...base,
    events: admitted,
    speeds,
    fsmLabels,
    stopEpisodes,
    summary: {
      ...base.summary,
      labelCount: speeds.length,
      speedNumericCount: speeds.length,
      stopEpisodeCount: stopEpisodes.length,
      eventCount: admitted.length,
      eventAcceptedCount: okEvents.length,
      eventArtefactSuspectCount: artefactCount,
    },
  };
}
