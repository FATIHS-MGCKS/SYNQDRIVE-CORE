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
import {
  buildDs4Layer2P4eA5A6TripDiagnosticsV1,
  summarizeDs4Layer2P4eA5A6CohortV1,
} from '../research/ds4-layer2-p4e-a5-a6-consistency.v1';
import { buildDs4Layer2P4eA5A6PinnedP4bEvidenceV1 } from '../research/ds4-layer2-p4e-a5-a6-pinned-harness.v1';

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('DS4 Layer-2 P4E A5+A6 — pinned 11-trip offline validation', () => {
  const tripInputs = loadDs4Layer2P2Pinned11TripLoadInputsV1();

  it('preserves P2 fixture checksums and 129 admissible event rows', () => {
    for (const [file, expected] of Object.entries(DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1)) {
      expect(sha256File(join(DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1, file))).toBe(expected);
    }
    const events = tripInputs.reduce((n, t) => n + t.loadInput.eventIntensityRecords.length, 0);
    expect(events).toBe(129);
    expect(tripInputs.length).toBe(11);
  });

  it('validates A5/A6 on 129 events with aligned harness and preserves A3/A4 + B/I/Phi/S', async () => {
    const { evidenceRows, admissibleEventCount } = await buildDs4Layer2P4eA5A6PinnedP4bEvidenceV1();
    expect(admissibleEventCount).toBe(129);
    expect(evidenceRows).toHaveLength(129);

    const reconRows = parseDs4Layer2P2PinnedCsvV1(
      readFileSync(join(DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1, 'p2_reconstructed_assessments.csv'), 'utf8'),
    );

    const buildTrips = () =>
      tripInputs.map((row) => {
        expect(DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1).toContain(
          row.tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number],
        );
        const longitudinalLoad = computeDs4LongitudinalLoadObservablesV1(row.loadInput);
        return {
          load: longitudinalLoad,
          a5a6: buildDs4Layer2P4eA5A6TripDiagnosticsV1({
            tripId: row.tripId,
            longitudinalLoad,
            records: row.loadInput.eventIntensityRecords,
            evidenceRows,
          }),
          a3a4: buildDs4Layer2P4eTripInterpretabilityV1({
            tripId: row.tripId,
            longitudinalLoad,
            eventIntensityRecords: row.loadInput.eventIntensityRecords,
          }),
        };
      });

    const runA = buildTrips();
    const runB = buildTrips();
    expect(JSON.stringify(runA)).toBe(JSON.stringify(runB));

    const trips = runA.map((r) => r.a5a6);
    const summary = summarizeDs4Layer2P4eA5A6CohortV1({ trips, admissibleEventCount: 129 });
    expect(summary.a5SecantSupportedCount).toBe(129);
    expect(summary.maxAbsSecantImpulseResidualMps ?? 1).toBeLessThan(1e-4);

    const a3Summary = summarizeDs4Layer2P4eCohortInterpretabilityV1({
      trips: runA.map((r) => r.a3a4),
      admissibleEventCount: 129,
    });
    expect(a3Summary.a3IdentityFailCount).toBe(0);

    for (const row of runA) {
      const csv = reconRows.find((r) => r.trip_id === row.a5a6.tripId)!;
      for (const kind of ['acceleration', 'deceleration'] as const) {
        const obs = row.load[kind];
        const prefix = kind === 'acceleration' ? 'accel' : 'brake';
        const csvB = csv[`${prefix}_B_k_mps`];
        const a6 = row.a5a6.a6[kind];
        if (csvB === '' && obs.admissibleEventCount === 0) {
          expect(a6.tierImpulseSemantics).toBe('ZERO_LOAD');
          expect(a6.bTotalMps).toBe(0);
        } else if (csvB !== '') {
          expect(obs.specificLongitudinalImpulseMps).toBeCloseTo(Number(csvB), 6);
          expect(a6.tierImpulseSemantics).toBe('DECOMPOSED');
          expect(a6.bTotalMatchesLoadModelB).toBe(true);
          expect((a6.bFullMps ?? 0) + (a6.bBinOnlyMps ?? 0)).toBeCloseTo(a6.bTotalMps ?? 0, 6);
        }
      }
      expect(row.a5a6.a5Events.length).toBeGreaterThan(0);
    }
  });

  it('detects perturbed inconsistent speed profile when boundary alignment is disabled', async () => {
    const { evidenceRows } = await buildDs4Layer2P4eA5A6PinnedP4bEvidenceV1({
      alignBoundaryToMeanAccel: false,
    });
    const trip = tripInputs[0]!;
    const longitudinalLoad = computeDs4LongitudinalLoadObservablesV1(trip.loadInput);
    const diag = buildDs4Layer2P4eA5A6TripDiagnosticsV1({
      tripId: trip.tripId,
      longitudinalLoad,
      records: trip.loadInput.eventIntensityRecords,
      evidenceRows,
    });
    const maxResidual = Math.max(
      ...diag.a5Events.map((e) => e.secantImpulseResidualAbsMps ?? 0),
    );
    expect(maxResidual).toBeGreaterThan(0.01);
  });
});
