#!/usr/bin/env npx ts-node
/** DS4 Layer-2 P4E A5+A6 — secant consistency + tier load decomposition (research only). */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { computeDs4LongitudinalLoadObservablesV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/ds4-longitudinal-load-observables.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11.attestation.v1';
import {
  DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1,
  loadDs4Layer2P2Pinned11TripLoadInputsV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11-fixture-loader.v1';
import {
  buildDs4Layer2P4eA5A6TripDiagnosticsV1,
  summarizeDs4Layer2P4eA5A6CohortV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4e-a5-a6-consistency.v1';
import { buildDs4Layer2P4eA5A6PinnedP4bEvidenceV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4e-a5-a6-pinned-harness.v1';
import {
  buildDs4Layer2P4eTripInterpretabilityV1,
  summarizeDs4Layer2P4eCohortInterpretabilityV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4e-a3-a4-interpretability.v1';

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
  const outDir = resolve(parseArg('--out-dir') ?? join('/tmp', 'ds4-p4e-a5-a6-out'));
  const fixtureDir = resolve(parseArg('--p2-dir') ?? DS4_LAYER2_P2_PINNED_11_FIXTURE_DIR_V1);
  const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const requiredAncestor = '88acf162faba98bbca851c174fb116fa991aa4e9';

  const { evidenceRows, admissibleEventCount } = await buildDs4Layer2P4eA5A6PinnedP4bEvidenceV1({
    p2FixtureDir: fixtureDir,
    alignBoundaryToMeanAccel: true,
    includeWindowSpeedSamples: true,
  });

  const tripInputs = loadDs4Layer2P2Pinned11TripLoadInputsV1(fixtureDir);
  const trips = tripInputs.map((row) => {
    const longitudinalLoad = computeDs4LongitudinalLoadObservablesV1(row.loadInput);
    return buildDs4Layer2P4eA5A6TripDiagnosticsV1({
      tripId: row.tripId,
      longitudinalLoad,
      records: row.loadInput.eventIntensityRecords,
      evidenceRows,
    });
  });

  const summary = summarizeDs4Layer2P4eA5A6CohortV1({ trips, admissibleEventCount });

  const a3Trips = tripInputs.map((row) =>
    buildDs4Layer2P4eTripInterpretabilityV1({
      tripId: row.tripId,
      longitudinalLoad: computeDs4LongitudinalLoadObservablesV1(row.loadInput),
      eventIntensityRecords: row.loadInput.eventIntensityRecords,
    }),
  );
  const a3Summary = summarizeDs4Layer2P4eCohortInterpretabilityV1({ trips: a3Trips, admissibleEventCount });

  const a5CsvLines = [
    'trip_id,event_index,event_kind,duration_tier,speed_support_tier,secant_support,secant_impulse_residual_mps,secant_impulse_residual_abs_mps,secant_accel_residual_mps2,shape_index_status,event_shape_index,repair_influenced',
  ];
  for (const trip of trips) {
    for (const ev of trip.a5Events) {
      a5CsvLines.push(
        [
          ev.tripId,
          ev.eventIndex,
          ev.eventKind,
          ev.durationTier,
          ev.speedSupportDurationTier,
          ev.secantSupportStatus,
          ev.secantImpulseResidualMps ?? '',
          ev.secantImpulseResidualAbsMps ?? '',
          ev.secantAccelResidualMps2 ?? '',
          ev.eventShapeIndexStatus,
          ev.eventShapeIndex ?? '',
          ev.repairInfluenced,
        ].join(','),
      );
    }
  }

  const a6CsvLines = [
    'trip_id,kind,b_total_mps,b_full_mps,b_bin_only_mps,full_share,bin_share,admissible_n,full_n,bin_n,tier_semantics,b_matches_load',
  ];
  for (const trip of trips) {
    for (const kind of [trip.a6.acceleration, trip.a6.deceleration]) {
      a6CsvLines.push(
        [
          trip.tripId,
          kind.kind,
          kind.bTotalMps ?? '',
          kind.bFullMps ?? '',
          kind.bBinOnlyMps ?? '',
          kind.fullContributionShare ?? '',
          kind.binOnlyContributionShare ?? '',
          kind.admissibleEventCount,
          kind.fullEventCount,
          kind.binOnlyEventCount,
          kind.tierImpulseSemantics,
          kind.bTotalMatchesLoadModelB ?? '',
        ].join(','),
      );
    }
  }

  const report = [
    '# P4E A5+A6 offline validation (pinned 11 trips)',
    '',
    `Evaluation SHA: ${baseSha}`,
    `Required ancestor: ${requiredAncestor}`,
    '',
    '## P2 integrity',
    '',
    `- Manifest checksum: ${DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1}`,
    `- Admissible events: ${admissibleEventCount} (expected 129)`,
    '',
    '## A5 secant + shape',
    '',
    `- Secant supported: ${summary.a5SecantSupportedCount}`,
    `- Shape defined: ${summary.a5ShapeDefinedCount}`,
    `- Max |impulse residual|: ${summary.maxAbsSecantImpulseResidualMps ?? 'n/a'} m/s`,
    '',
    '## A6 tier decomposition',
    '',
    `- Kind-cells decomposed: ${summary.a6KindCellsDecomposed}`,
    `- Kind-cells zero-load: ${summary.a6KindCellsZeroLoad}`,
    `- Kind-cells unavailable: ${summary.a6KindCellsUnavailable}`,
    '',
    '## A1–A4 compatibility (unchanged producers)',
    '',
    `- A3 identity fail count: ${a3Summary.a3IdentityFailCount}`,
    `- A3 identity pass count: ${a3Summary.a3IdentityPassCount}`,
    '',
  ].join('\n');

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'p4e_a5_a6_cohort_summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'p4e_a5_event_consistency.csv'), `${a5CsvLines.join('\n')}\n`, 'utf8');
  writeFileSync(join(outDir, 'p4e_a6_tier_decomposition.csv'), `${a6CsvLines.join('\n')}\n`, 'utf8');
  writeFileSync(join(outDir, 'p4e_a5_a6_trip_diagnostics.json'), `${JSON.stringify(trips, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'P4E_A5_A6_INVARIANT_REPORT.md'), report, 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        outDir,
        baseSha,
        requiredAncestor,
        summary,
        a3Summary,
        p2InputChecksumsSha256: DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
        a5CsvSha256: sha256Hex(a5CsvLines.join('\n') + '\n'),
        a6CsvSha256: sha256Hex(a6CsvLines.join('\n') + '\n'),
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
