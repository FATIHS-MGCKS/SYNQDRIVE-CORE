import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeDs4LongitudinalLoadObservablesV1 } from '../ds4-longitudinal-load-observables.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
} from '../research/ds4-layer2-p2-pinned-11.attestation.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1,
  loadDs4Layer2P2Pinned11TripLoadInputsV1,
  parseDs4Layer2P2PinnedCsvV1,
} from '../research/ds4-layer2-p2-pinned-11-fixture-loader.v1';
import {
  buildDs4Layer2P4eTripInterpretabilityV1,
  summarizeDs4Layer2P4eCohortInterpretabilityV1,
} from '../research/ds4-layer2-p4e-a3-a4-interpretability.v1';

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('DS4 Layer-2 P4E A3+A4 — pinned 11-trip offline validation', () => {
  const tripInputs = loadDs4Layer2P2Pinned11TripLoadInputsV1();

  it('preserves P2 fixture checksums and 129 admissible event rows', () => {
    for (const [file, expected] of Object.entries(DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1)) {
      expect(sha256File(join(DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1, file))).toBe(expected);
    }
    const events = tripInputs.reduce((n, t) => n + t.loadInput.eventIntensityRecords.length, 0);
    expect(events).toBe(129);
    expect(tripInputs.length).toBe(11);
  });

  it('validates A3 identity on all computable kind-cells and leaves B/I/Phi/S unchanged vs P2 CSV', () => {
    const reconRows = parseDs4Layer2P2PinnedCsvV1(
      readFileSync(join(DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1, 'p2_reconstructed_assessments.csv'), 'utf8'),
    );

    const trips = tripInputs.map((row) => {
      expect(DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1).toContain(
        row.tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number],
      );
      const longitudinalLoad = computeDs4LongitudinalLoadObservablesV1(row.loadInput);
      return buildDs4Layer2P4eTripInterpretabilityV1({
        tripId: row.tripId,
        longitudinalLoad,
        eventIntensityRecords: row.loadInput.eventIntensityRecords,
      });
    });

    const summary = summarizeDs4Layer2P4eCohortInterpretabilityV1({
      trips,
      admissibleEventCount: 129,
    });
    expect(summary.a3IdentityFailCount).toBe(0);
    expect(summary.a3IdentityPassCount).toBeGreaterThan(0);

    for (const trip of trips) {
      const csv = reconRows.find((r) => r.trip_id === trip.tripId)!;
      for (const kind of ['acceleration', 'deceleration'] as const) {
        const obs = trip.longitudinalLoad[kind];
        const prefix = kind === 'acceleration' ? 'accel' : 'brake';
        const csvB = csv[`${prefix}_B_k_mps`];
        const csvI = csv[`${prefix}_I_k_mps2`];
        if (csvB === '' && obs.admissibleEventCount === 0) {
          expect(obs.specificLongitudinalImpulseMps).toBe(0);
          expect(trip[kind].intensityDecomposition.identityHoldsWithinTolerance).toBe(true);
        } else if (csvB !== '') {
          expect(obs.specificLongitudinalImpulseMps).toBeCloseTo(Number(csvB), 6);
          expect(obs.normalizedMeanAccelMps2).toBeCloseTo(Number(csvI), 6);
          expect(trip[kind].intensityDecomposition.identityHoldsWithinTolerance).toBe(true);
        }
      }
    }
  });
});
