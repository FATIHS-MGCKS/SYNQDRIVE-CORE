import type { Ds4Layer2P4bEventSpeedEvidenceRowV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import { buildDs4Layer2P4bEventKinematicsEvidenceV1 } from './ds4-layer2-p4b-event-kinematics-evidence.v1';
import { createDs4Layer2P4bMapPayloadLoaderV1 } from './ds4-layer2-p4b-payload-loader.v1';
import { loadDs4Layer2P4bP2AdmissibleEventsV1 } from './ds4-layer2-p4b-preflight.v1';
import { buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1 } from './ds4-layer2-p4b-test-payload-synth.v1';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
} from './ds4-layer2-p2-pinned-11.attestation.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1,
  loadDs4Layer2P2Pinned11TripLoadInputsV1,
} from './ds4-layer2-p2-pinned-11-fixture-loader.v1';

/** Build mean-accel lookup from pinned P2 longitudinal fixture (research harness only). */
export function buildDs4Layer2P4eA5MeanAccelMapFromPinnedTripsV1(
  fixtureDir: string = DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const trip of loadDs4Layer2P2Pinned11TripLoadInputsV1(fixtureDir)) {
    for (const record of trip.loadInput.eventIntensityRecords) {
      if (record.meanAccelMps2 == null || !Number.isFinite(record.meanAccelMps2)) continue;
      map.set(`${trip.tripId}#${record.eventIndex}`, record.meanAccelMps2);
    }
  }
  return map;
}

/**
 * Offline pinned-11 P4B evidence for P4E A5/A6 (synthetic motion payloads, optional boundary alignment).
 * Does not mutate P2 fixtures or touch production DB.
 */
export async function buildDs4Layer2P4eA5A6PinnedP4bEvidenceV1(input?: {
  p2FixtureDir?: string;
  alignBoundaryToMeanAccel?: boolean;
  includeWindowSpeedSamples?: boolean;
}): Promise<{
  evidenceRows: Ds4Layer2P4bEventSpeedEvidenceRowV1[];
  admissibleEventCount: number;
}> {
  const fixtureDir = input?.p2FixtureDir ?? DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1;
  const admissibleEvents = loadDs4Layer2P4bP2AdmissibleEventsV1(fixtureDir);
  const meanMap = buildDs4Layer2P4eA5MeanAccelMapFromPinnedTripsV1(fixtureDir);
  const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(admissibleEvents, {
    includeWindowSpeedSamples: input?.includeWindowSpeedSamples ?? true,
    alignBoundaryToMeanAccel: input?.alignBoundaryToMeanAccel ?? true,
    meanAccelMps2ByEventKey: meanMap,
    linearInWindowSpeedSamples: true,
  });
  const built = await buildDs4Layer2P4bEventKinematicsEvidenceV1({
    organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
    admissibleEvents,
    payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
  });
  if (built.evidenceRows.length !== DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1) {
    throw new Error(
      `P4B pinned harness expected ${DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1} rows, got ${built.evidenceRows.length}`,
    );
  }
  return { evidenceRows: built.evidenceRows, admissibleEventCount: admissibleEvents.length };
}
