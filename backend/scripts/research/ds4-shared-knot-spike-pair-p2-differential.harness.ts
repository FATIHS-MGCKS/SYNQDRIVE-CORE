/**
 * P2 eight-trip differential replay for SHARED_KNOT_SPIKE_PAIR gate (read-only DB).
 * Applies only the new spike-pair gate to persisted shadow payloads; does not persist.
 */
import { PrismaClient } from '@prisma/client';
import { DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.cohort.v1';
import { Ds4Layer2P2OfflineReconstructionReadRepositoryV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.repository.v1';
import { selectDs4Layer2P2MotionRevisionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.revision-selector.v1';
import {
  decodeMotionCoreShadowPayloadGzipV1,
  evaluateDs4Layer2P2MotionRevisionCandidateV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.v1';
import { aggregateDs4EventIntensityEligibilityV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-assessment-event-intensity-eligibility.v1';
import { projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-longitudinal-load-observables.v1';
import { computeDs4TripAssessmentV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.engine';
import {
  applyMotionEventSharedKnotSpikePairGate,
  type MotionEventIntensityEvidenceGateOptionsV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-event-intensity-endpoint-evidence.v1';
import type { MotionManoeuvreEvent } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-event.types';
import type { MotionCoreSpeedSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/speed-sample.types';
import type {
  DiV0MotionCoreShadowPayloadV1,
  DiV0MotionCoreShadowPersistedEventRow,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import type { Ds4SpeedAuthorityPartitionV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-trip-assessment-v1.contract';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function eventSpeedSeriesFromPayload(payload: DiV0MotionCoreShadowPayloadV1): MotionCoreSpeedSample[] {
  return payload.speeds.map((r) => ({
    label: r.bucketLabelUtc,
    valueKmh: r.speedKmh,
    quality: r.quality as MotionCoreSpeedSample['quality'],
    estimator: r.estimator,
    supportLabels: r.support ?? [],
    supportSpanS: null,
    flags: r.flags ?? [],
  }));
}

function persistedToMotionEvent(row: DiV0MotionCoreShadowPersistedEventRow): MotionManoeuvreEvent {
  const mean = row.intensity?.meanAccelMps2 ?? 0;
  return {
    trip: 0,
    kind: row.kind as MotionManoeuvreEvent['kind'],
    startLabel: row.startLabel,
    endLabel: row.endLabel,
    startUncertaintyS: '',
    endUncertaintyS: '',
    startSpeedKmh: row.startSpeedKmh,
    endSpeedKmh: row.endSpeedKmh,
    deltaKmh: row.deltaKmh,
    meanAccelMps2: mean,
    peakAccel1sMps2: mean,
    peakAccel2sMps2: null,
    durationS: row.intensity?.durationS ?? 0,
    steps: row.intensity?.steps ?? 0,
    coverageRatio: row.intensity?.coverageRatio ?? 1,
    quality: row.quality as MotionManoeuvreEvent['quality'],
    source: 'PERSISTED',
    algorithmVersion: 'PERSISTED',
    flags: [...(row.flags ?? [])],
  };
}

function gateOptions(payload: DiV0MotionCoreShadowPayloadV1): MotionEventIntensityEvidenceGateOptionsV1 | undefined {
  if (payload.contract.speedAuthority !== 'C5_1_PREFERRED') {
    return undefined;
  }
  return {
    c51RepairEvidence: (payload.speedRepairs ?? []).map((r) => ({
      bucketLabelUtc: r.bucketLabelUtc,
      q5Evidence: r.q5Evidence,
      q6Evidence: r.q6Evidence,
    })),
  };
}

function applySpikePairGateToPayload(payload: DiV0MotionCoreShadowPayloadV1): void {
  const motionEvents = payload.events.map((e) => persistedToMotionEvent(e));
  applyMotionEventSharedKnotSpikePairGate(
    motionEvents,
    eventSpeedSeriesFromPayload(payload),
    gateOptions(payload),
  );
  for (let i = 0; i < payload.events.length; i++) {
    payload.events[i]!.quality = motionEvents[i]!.quality;
    payload.events[i]!.flags = motionEvents[i]!.flags;
  }
}

function summarize(
  tripId: string,
  vehicleId: string,
  payload: DiV0MotionCoreShadowPayloadV1,
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null,
) {
  const agg = aggregateDs4EventIntensityEligibilityV1({ payload, speedAuthority });
  const assessment = computeDs4TripAssessmentV1({
    scope: { organizationId: ORG, vehicleId, tripId },
    motionRun: {
      id: 'offline',
      organizationId: ORG,
      vehicleId,
      tripId,
      shadowStatus: 'SUCCEEDED',
      pinnedSnapshotHash: 'offline',
      combinedInputIdentity: 'offline',
      contentFingerprint: 'offline',
      createdAt: new Date(),
    },
    payload,
  });
  const l2 = projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1({
    assessmentStatus: assessment.assessmentStatus,
    evidenceQuality: assessment.evidenceQuality,
    speedAuthority: assessment.speedAuthority,
    eventSummariesJson: assessment.eventSummaries,
  });
  const accelVals = agg.admissibleOrdinalValues.acceleration;
  const brakeVals = agg.admissibleOrdinalValues.deceleration;
  return {
    admissible: agg.ratedEventCount,
    exclusions: agg.unratedEventCount,
    accelMax: accelVals.length ? Math.max(...accelVals) : null,
    brakeMax: brakeVals.length ? Math.max(...brakeVals) : null,
    accelB: l2.acceleration.specificLongitudinalImpulseMps,
    brakeB: l2.deceleration.specificLongitudinalImpulseMps,
    accelI: l2.acceleration.normalizedMeanAccelMps2,
    brakeI: l2.deceleration.normalizedMeanAccelMps2,
    records: agg.records,
  };
}

async function main() {
  const prisma = new PrismaClient();
  const repo = new Ds4Layer2P2OfflineReconstructionReadRepositoryV1(prisma);
  const result: Record<string, unknown> = {
    operation: 'DS4_SHARED_KNOT_SPIKE_PAIR_P2_DIFFERENTIAL',
    trips: [] as unknown[],
  };

  for (const entry of DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1) {
    const runs = await repo.loadSucceededMotionRunsForTrip({ organizationId: ORG, tripId: entry.tripId });
    const candidates = [];
    for (const run of runs) {
      const payloadGzip = await repo.loadMotionRunPayloadGzip(run.id, ORG);
      candidates.push(
        evaluateDs4Layer2P2MotionRevisionCandidateV1({
          motionRunId: run.id,
          createdAt: run.createdAt,
          pinnedSnapshotHash: run.pinnedSnapshotHash,
          combinedInputIdentity: run.combinedInputIdentity,
          contentFingerprint: run.contentFingerprint,
          summaryJson: run.summaryJson,
          payloadGzip,
          scope: { organizationId: ORG, vehicleId: run.vehicleId, tripId: entry.tripId },
        }),
      );
    }
    const selection = selectDs4Layer2P2MotionRevisionV1({ tripId: entry.tripId, candidates });
    const selected = selection.selected;
    const payloadGzip = await repo.loadMotionRunPayloadGzip(selected.motionRunId, ORG);
    const { payload } = decodeMotionCoreShadowPayloadGzipV1(payloadGzip);
    if (!payload) throw new Error(`missing payload ${entry.tripId}`);
    const vehicleId = runs.find((r) => r.id === selected.motionRunId)!.vehicleId;

    const before = summarize(entry.tripId, vehicleId, payload, selected.speedAuthority);
    const afterPayload = JSON.parse(JSON.stringify(payload)) as DiV0MotionCoreShadowPayloadV1;
    applySpikePairGateToPayload(afterPayload);
    const after = summarize(entry.tripId, vehicleId, afterPayload, selected.speedAuthority);

    const classificationChanges = before.records
      .map((b, idx) => {
        const a = after.records[idx]!;
        if (b.classification === a.classification) return null;
        return {
          eventIndex: b.eventIndex,
          kind: b.kind,
          beforeClass: b.classification,
          afterClass: a.classification,
        };
      })
      .filter(Boolean);

    (result.trips as unknown[]).push({
      tripId: entry.tripId,
      vehicleLine: entry.vehicleLine,
      speedAuthority: entry.expectedSpeedAuthority,
      sourceFamily: entry.expectedSourceFamily,
      before: {
        admissible: before.admissible,
        exclusions: before.exclusions,
        accelMax: before.accelMax,
        brakeMax: before.brakeMax,
        accelB: before.accelB,
        brakeB: before.brakeB,
        accelI: before.accelI,
        brakeI: before.brakeI,
      },
      after: {
        admissible: after.admissible,
        exclusions: after.exclusions,
        accelMax: after.accelMax,
        brakeMax: after.brakeMax,
        accelB: after.accelB,
        brakeB: after.brakeB,
        accelI: after.accelI,
        brakeI: after.brakeI,
      },
      classificationChanges,
    });
  }

  await prisma.$disconnect();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
