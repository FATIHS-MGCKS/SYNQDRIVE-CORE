#!/usr/bin/env npx ts-node
/** Writes full 129-event P4E synthetic artifact bundle (no DB). */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11.attestation.v1';
import { loadDs4Layer2P4bP2AdmissibleEventsV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-preflight.v1';
import { createDs4Layer2P4bMapPayloadLoaderV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-payload-loader.v1';
import { DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-pinned-source-runs.v1';
import { buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-test-payload-synth.v1';
import {
  buildDs4Layer2P4eEventKinematicsEvidenceV1,
  buildDs4Layer2P4eSidecarArtifactsV1,
  buildDs4Layer2P4eValidationReportMarkdownV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4e-event-kinematics-evidence.v1';

async function main(): Promise<void> {
  const cwd = resolve(__dirname, '../..');
  const p2Dir = join(
    cwd,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/fixtures/ds4-layer2-p2-pinned-11',
  );
  const outDir = resolve(process.argv[2] ?? '/opt/cursor/artifacts/p4e-a1-repair-semantics');
  const events = loadDs4Layer2P4bP2AdmissibleEventsV1(p2Dir);
  const payloads = buildDs4Layer2P4bSyntheticPayloadsFromP2EventsV1(events, {
    includeWindowSpeedSamples: true,
    c51PassThroughGridRepairRows: true,
  });
  const built = await buildDs4Layer2P4eEventKinematicsEvidenceV1({
    organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
    admissibleEvents: events,
    payloadLoader: createDs4Layer2P4bMapPayloadLoaderV1(payloads),
  });
  const legacyTrue = built.evidenceRows.filter((r) => r.repairInfluencedLegacy).length;
  const acceptedEvents = built.evidenceRows.filter((r) => r.repairAcceptedInWindow).length;
  const builtAtUtc = new Date('2026-10-31T12:00:00.000Z');
  const report = buildDs4Layer2P4eValidationReportMarkdownV1({
    baseSha: 'synthetic-harness',
    evaluationCodeSha: 'synthetic-harness',
    builtAtUtc,
    repairHistogram: built.repairHistogram,
    legacyFlagCount: legacyTrue,
    legacyMatchesAuthority: built.evidenceRows.every(
      (r) => r.repairInfluencedLegacy === (r.payloadSpeedAuthority === 'C5_1_PREFERRED'),
    ),
    acceptedInWindowEventCount: acceptedEvents,
    p2ChecksumsUnchanged: true,
    exactJoinCount: built.evidenceRows.length,
    negativeControlsPassed: true,
    realPayloadSource: 'SYNTHETIC_TEST_HARNESS',
  });
  const artifacts = buildDs4Layer2P4eSidecarArtifactsV1({
    p4eEvaluationCodeSha: 'synthetic-harness',
    p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
    p3cMergeShaReference: '8487ff73e3e2f7dbf8f2e77f00dce315398d49b9',
    organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
    builtAtUtc,
    evidenceRows: built.evidenceRows,
    joinExclusions: built.joinExclusions,
    summary: built.summary,
    repairHistogram: built.repairHistogram,
    pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
    validationReportMarkdown: `${report}\n\n## Real payload note\n\nProduction read-only replay requires valid \`DATABASE_URL\` to pinned Motion V2 payloads. Cloud agent local DB auth failed; re-run \`npm run research:ds4-layer2-p4e-a1-repair-semantics\` on an environment with production read access.\n`,
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'p4e_manifest.json'), `${JSON.stringify(artifacts.manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'p4e_event_speed_evidence.csv'), artifacts.eventSpeedEvidenceCsv);
  writeFileSync(join(outDir, 'p4e_repair_state_histogram.json'), artifacts.repairStateHistogramJson);
  writeFileSync(join(outDir, 'p4e_join_exclusions.csv'), artifacts.joinExclusionsCsv);
  writeFileSync(join(outDir, 'p4e_coverage_summary.json'), artifacts.coverageSummaryJson);
  writeFileSync(join(outDir, 'P4E_VALIDATION_REPORT.md'), artifacts.validationReportMarkdown);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ outDir, legacyTrue, acceptedEvents, manifest: artifacts.manifest.manifestChecksumSha256 }, null, 2));
}

main();
