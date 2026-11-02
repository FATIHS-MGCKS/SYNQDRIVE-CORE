import { readFileSync } from 'fs';
import { join } from 'path';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import { emptyDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import type { Ds4LongitudinalLoadObservablesInputV1 } from '../ds4-longitudinal-load-observables.v1.contract';
import { DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1 } from './ds4-layer2-p2-pinned-11.attestation.v1';

export const DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1 = join(
  __dirname,
  'fixtures/ds4-layer2-p2-pinned-11',
);

export function parseDs4Layer2P2PinnedCsvV1(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  const header = lines[0]!.split(',');
  return lines.slice(1).map((line) => {
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    return row;
  });
}

export function ds4Layer2P2RecordFromLongitudinalRowV1(
  row: Record<string, string>,
): Ds4EventIntensityEligibilityRecordV1 {
  return {
    eventIndex: Number(row.event_index),
    kind: row.event_kind as Ds4EventIntensityEligibilityRecordV1['kind'],
    classification: row.eligibility_classification as Ds4EventIntensityEligibilityRecordV1['classification'],
    durationTier: row.duration_tier as Ds4EventIntensityEligibilityRecordV1['durationTier'],
    eventQuality: row.event_quality as Ds4EventIntensityEligibilityRecordV1['eventQuality'],
    speedAuthority: row.speed_authority as Ds4EventIntensityEligibilityRecordV1['speedAuthority'],
    meanAccelMps2: row.mean_accel_mps2 === '' ? null : Number(row.mean_accel_mps2),
    durationS: Number(row.duration_s),
    steps: Number(row.steps),
    coverageRatio: Number(row.coverage_ratio),
    startUncertaintyS: '±1s',
    endUncertaintyS: '±1s',
    reasonCodes: [],
    startLabel: row.start_label_utc,
    endLabel: row.end_label_utc,
  };
}

export type Ds4Layer2P2PinnedTripLoadInputV1 = {
  tripId: string;
  vehicleId: string;
  sourceMotionRunId: string;
  loadInput: Ds4LongitudinalLoadObservablesInputV1;
};

export function loadDs4Layer2P2Pinned11TripLoadInputsV1(
  fixtureDir: string = DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1,
): Ds4Layer2P2PinnedTripLoadInputV1[] {
  const longitudinal = parseDs4Layer2P2PinnedCsvV1(
    readFileSync(join(fixtureDir, 'p2_longitudinal_events.csv'), 'utf8'),
  );
  const reconstructed = parseDs4Layer2P2PinnedCsvV1(
    readFileSync(join(fixtureDir, 'p2_reconstructed_assessments.csv'), 'utf8'),
  );

  const eventsByTrip = new Map<string, Ds4EventIntensityEligibilityRecordV1[]>();
  for (const row of longitudinal) {
    const tripId = row.trip_id!;
    const list = eventsByTrip.get(tripId) ?? [];
    list.push(ds4Layer2P2RecordFromLongitudinalRowV1(row));
    eventsByTrip.set(tripId, list);
  }

  return reconstructed.map((tripRow) => {
    const tripId = tripRow.trip_id!;
    const records = eventsByTrip.get(tripId) ?? [];
    const rated = records.filter((r) => r.classification.startsWith('ADMISSIBLE')).length;
    const speedAuthority = tripRow.speed_authority as 'C4_ONLY' | 'C5_1_PREFERRED';
    const exposure = {
      ...emptyDs4DrivingExposureV1(speedAuthority),
      derivable: tripRow.exposure_derivable === 'true',
      exposureSeconds: Number(tripRow.exposure_seconds_Es),
      distanceKm: Number(tripRow.distance_km_D),
      provenance: {
        ...emptyDs4DrivingExposureV1(speedAuthority).provenance,
        speedAuthority,
        qualifyingIntervalCount: Number(tripRow.exposure_seconds_Es),
        fsmMovingDirectLabelCount: Number(tripRow.exposure_seconds_Es),
      },
    };

    return {
      tripId,
      vehicleId: tripRow.vehicle_id!,
      sourceMotionRunId: tripRow.source_motion_run_id!,
      loadInput: {
        assessmentStatus: 'UNRATED_COUNTS_ONLY',
        evidenceQuality: 'PRESENT',
        speedAuthority,
        ratedEventCount: rated,
        unratedEventCount: 0,
        artefactSuspectCount: 0,
        drivingExposure: exposure,
        eventIntensityRecords: records,
      },
    };
  });
}

export const DS4_LAYER2_P2_PINNED_11_ORG_ID_V1 = DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1;
