import { readFileSync } from 'fs';
import { join } from 'path';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import { emptyDs4DrivingExposureV1 } from '../ds4-assessment-driving-exposure.v1';
import { computeDs4LongitudinalLoadObservablesV1 } from '../ds4-longitudinal-load-observables.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
} from '../research/ds4-layer2-p2-pinned-11.attestation.v1';
import { createHash } from 'crypto';

const FIXTURE_P2_DIR = join(__dirname, '../research/fixtures/ds4-layer2-p2-pinned-11');

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseCsv(text: string): Record<string, string>[] {
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

function recordFromLongitudinalRow(row: Record<string, string>): Ds4EventIntensityEligibilityRecordV1 {
  const classification = row.eligibility_classification as Ds4EventIntensityEligibilityRecordV1['classification'];
  return {
    eventIndex: Number(row.event_index),
    kind: row.event_kind as Ds4EventIntensityEligibilityRecordV1['kind'],
    classification,
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

describe('DS4 Layer-2 P4E A2 — pinned 11-trip offline validation', () => {
  it('leaves P2 fixture checksums byte-identical', () => {
    for (const [file, expected] of Object.entries(DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1)) {
      expect(sha256File(join(FIXTURE_P2_DIR, file))).toBe(expected);
    }
  });

  it('corrects exactly two kind-level zero-load cells on pinned cohort (129 events unchanged)', () => {
    const longitudinal = parseCsv(readFileSync(join(FIXTURE_P2_DIR, 'p2_longitudinal_events.csv'), 'utf8'));
    expect(longitudinal.length).toBe(129);

    const reconstructed = parseCsv(readFileSync(join(FIXTURE_P2_DIR, 'p2_reconstructed_assessments.csv'), 'utf8'));
    expect(reconstructed.length).toBe(11);

    const eventsByTrip = new Map<string, Ds4EventIntensityEligibilityRecordV1[]>();
    for (const row of longitudinal) {
      const tripId = row.trip_id!;
      const list = eventsByTrip.get(tripId) ?? [];
      list.push(recordFromLongitudinalRow(row));
      eventsByTrip.set(tripId, list);
    }

    let correctedCells = 0;
    const expectedCorrections: { tripId: string; kind: 'acceleration' | 'deceleration' }[] = [
      { tripId: 'c0448fea-e7c3-4658-b2fd-417c452f70d7', kind: 'acceleration' },
      { tripId: 'dfc7c443-d847-4d31-8c84-9c0f11e47e1e', kind: 'deceleration' },
    ];

    for (const tripRow of reconstructed) {
      const tripId = tripRow.trip_id!;
      expect(DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1).toContain(tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number]);

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

      const out = computeDs4LongitudinalLoadObservablesV1({
        assessmentStatus: 'UNRATED_COUNTS_ONLY',
        evidenceQuality: 'PRESENT',
        speedAuthority,
        ratedEventCount: rated,
        unratedEventCount: 0,
        artefactSuspectCount: 0,
        drivingExposure: exposure,
        eventIntensityRecords: records,
      });

      expect(out.reasonCodes).toEqual([]);

      const kinds: Array<'acceleration' | 'deceleration'> = ['acceleration', 'deceleration'];
      for (const kind of kinds) {
        const obs = out[kind];
        const prefix = kind === 'acceleration' ? 'accel' : 'brake';
        const csvB = tripRow[`${prefix}_B_k_mps`];
        const csvI = tripRow[`${prefix}_I_k_mps2`];
        const wasEmpty = csvB === '' && csvI === '';

        if (wasEmpty && obs.admissibleEventCount === 0) {
          correctedCells += 1;
          expect(obs.specificLongitudinalImpulseMps).toBe(0);
          expect(obs.normalizedMeanAccelMps2).toBe(0);
          expect(obs.eventFrequencyPerMinute).toBe(0);
          expect(obs.maneuverTimeShare).toBe(0);
          expect(obs.impulseSemantics).toBe('SPECIFIC_LONGITUDINAL_IMPULSE_MPS');
        } else if (!wasEmpty) {
          expect(obs.specificLongitudinalImpulseMps).toBeCloseTo(Number(csvB), 6);
          expect(obs.normalizedMeanAccelMps2).toBeCloseTo(Number(csvI), 6);
        }
      }
    }

    expect(correctedCells).toBe(2);
    for (const fix of expectedCorrections) {
      expect(eventsByTrip.get(fix.tripId)?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
