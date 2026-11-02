import type { PrismaClient, TripDetectionState } from '@prisma/client';
import type { Queue } from 'bullmq';
import { resolveEndCycleToken } from './trip-end-cycle-reset';
import { readEvidenceRevisionFromSummary } from './trip-end-validation-observability.domain';
import type { TripTrackingJobData } from './trip-detection.types';
import { readStopBoundaryAt } from './trip-fsm-evidence-state';

export type FsmGoldenFingerprint = {
  det: {
    state: TripDetectionState | null;
    endValidationAttempts: number | null;
    endDetectionMode: string | null;
    activeTripId: string | null;
    possibleEndAt: string | null;
    cusumSegmentEnd: string | null;
    endCycleToken: string | null;
  };
  trip: {
    status: string | null;
    endTime: string | null;
    endValidationMeta: unknown;
  };
  admission: {
    stopBoundaryAt: string | null;
    evidenceRevision: string | null;
  };
  queueTriggers: string[];
};

export async function captureFsmGoldenFingerprint(params: {
  prisma: PrismaClient;
  queue: Queue<TripTrackingJobData>;
  vehicleId: string;
  tripId: string;
}): Promise<FsmGoldenFingerprint> {
  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.vehicleId },
    select: {
      state: true,
      endValidationAttempts: true,
      endDetectionMode: true,
      activeTripId: true,
      possibleEndAt: true,
      cusumSegmentEnd: true,
      possibleEndEnteredAt: true,
      lastEvidenceSummary: true,
    },
  });
  const trip = await params.prisma.vehicleTrip.findUnique({
    where: { id: params.tripId },
    select: { tripStatus: true, endTime: true, rawDetectionMeta: true },
  });
  const summary =
    (det?.lastEvidenceSummary as Record<string, unknown> | null) ?? null;

  const states = ['waiting', 'delayed', 'active', 'prioritized', 'paused'] as const;
  const queueTriggers: string[] = [];
  for (const state of states) {
    const batch = await params.queue.getJobs([state], 0, 50);
    for (const job of batch) {
      if (job.data.vehicleId !== params.vehicleId) continue;
      queueTriggers.push(`${job.data.trigger}:${job.data.endCycleToken ?? 'no-token'}`);
    }
  }
  queueTriggers.sort();

  return {
    det: {
      state: det?.state ?? null,
      endValidationAttempts: det?.endValidationAttempts ?? null,
      endDetectionMode: det?.endDetectionMode ?? null,
      activeTripId: det?.activeTripId ?? null,
      possibleEndAt: det?.possibleEndAt?.toISOString() ?? null,
      cusumSegmentEnd: det?.cusumSegmentEnd?.toISOString() ?? null,
      endCycleToken: det
        ? resolveEndCycleToken(det as Parameters<typeof resolveEndCycleToken>[0])
        : null,
    },
    trip: {
      status: trip?.tripStatus ?? null,
      endTime: trip?.endTime?.toISOString() ?? null,
      endValidationMeta:
        (trip?.rawDetectionMeta as Record<string, unknown> | null)?.endValidation ??
        null,
    },
    admission: {
      stopBoundaryAt: readStopBoundaryAt(summary)?.toISOString() ?? null,
      evidenceRevision: readEvidenceRevisionFromSummary(summary),
    },
    queueTriggers,
  };
}

export function normalizeFsmGoldenFingerprint(
  fp: FsmGoldenFingerprint,
): FsmGoldenFingerprint {
  return {
    ...fp,
    det: {
      ...fp.det,
      activeTripId: fp.det.activeTripId ? 'ACTIVE_TRIP_PRESENT' : null,
    },
  };
}

export function assertFsmGoldenParity(
  off: FsmGoldenFingerprint,
  on: FsmGoldenFingerprint,
): void {
  expect(normalizeFsmGoldenFingerprint(on)).toEqual(normalizeFsmGoldenFingerprint(off));
}
