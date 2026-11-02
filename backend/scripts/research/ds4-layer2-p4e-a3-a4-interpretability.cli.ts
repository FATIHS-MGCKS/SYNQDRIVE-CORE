#!/usr/bin/env npx ts-node
/** DS4 Layer-2 P4E A3+A4 — interpretability research sidecar (offline pinned cohort). */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { computeDs4LongitudinalLoadObservablesV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-longitudinal-load-observables.v1';
import {
  buildDs4Layer2P4eTripInterpretabilityV1,
  summarizeDs4Layer2P4eCohortInterpretabilityV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4e-a3-a4-interpretability.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11.attestation.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1,
  loadDs4Layer2P2Pinned11TripLoadInputsV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11-fixture-loader.v1';

function parseArg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=').trim();
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const cwd = resolve(__dirname, '../..');
  const outDir = resolve(parseArg('--out-dir') ?? join('/tmp', 'ds4-p4e-a3-a4-out'));
  const fixtureDir = resolve(parseArg('--p2-dir') ?? DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1);
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

  const tripInputs = loadDs4Layer2P2Pinned11TripLoadInputsV1(fixtureDir);
  const trips = tripInputs.map((row) => {
    const longitudinalLoad = computeDs4LongitudinalLoadObservablesV1(row.loadInput);
    return buildDs4Layer2P4eTripInterpretabilityV1({
      tripId: row.tripId,
      longitudinalLoad,
      eventIntensityRecords: row.loadInput.eventIntensityRecords,
    });
  });

  const admissibleEventCount = tripInputs.reduce(
    (n, t) => n + t.loadInput.eventIntensityRecords.filter((r) => r.classification.startsWith('ADMISSIBLE')).length,
    0,
  );
  const summary = summarizeDs4Layer2P4eCohortInterpretabilityV1({ trips, admissibleEventCount });

  const tripLines = [
    'trip_id,kind,mean_event_accel_mps2,identity_holds,evidence_quantity_tier,admissible_n,full_n,I_k,S_k',
  ];
  for (const trip of trips) {
    for (const kind of [trip.acceleration, trip.deceleration]) {
      const d = kind.intensityDecomposition;
      tripLines.push(
        [
          trip.tripId,
          kind.kind,
          d.meanEventAccelerationMps2 ?? '',
          d.identityHoldsWithinTolerance ?? '',
          kind.evidenceSupport.evidenceQuantityTier,
          kind.evidenceSupport.admissibleEventCount,
          kind.evidenceSupport.fullEventCount,
          d.exposureNormalizedIntensityMps2 ?? '',
          d.admissibleEventTimeShare ?? '',
        ].join(','),
      );
    }
  }

  const invariantReport = [
    '# P4E A3+A4 invariant report (pinned 11 trips)',
    '',
    `Evaluation SHA: ${baseSha}`,
    '',
    '## Numerical invariants',
    '',
    '- Load model `computeDs4LongitudinalLoadObservablesV1` unchanged (this CLI only projects diagnostics).',
    `- P2 manifest checksum: ${DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1}`,
    `- Admissible events: ${admissibleEventCount} (expected 129)`,
    '',
    '## A3 identity (I_k = S_k × meanEventAcceleration_k)',
    '',
    `- Pass: ${summary.a3IdentityPassCount} kind-cells`,
    `- Fail: ${summary.a3IdentityFailCount}`,
    `- Unavailable: ${summary.a3IdentityUnavailableCount}`,
    '',
    '## A4 evidence quantity tiers (N_FULL gates)',
    '',
    '```json',
    JSON.stringify(summary.a4SupportDistribution, null, 2),
    '```',
    '',
  ].join('\n');

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'p4e_a3_a4_cohort_summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'p4e_a3_a4_trip_diagnostics.csv'), `${tripLines.join('\n')}\n`, 'utf8');
  writeFileSync(join(outDir, 'p4e_a3_a4_trip_interpretability.json'), `${JSON.stringify(trips, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'P4E_A3_A4_INVARIANT_REPORT.md'), invariantReport, 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        outDir,
        baseSha,
        summary,
        p2ManifestChecksumSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
        p2InputChecksumsSha256: DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
        tripDiagnosticCsvSha256: sha256Hex(tripLines.join('\n') + '\n'),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
