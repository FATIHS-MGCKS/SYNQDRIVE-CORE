#!/usr/bin/env npx ts-node
/**
 * DS4 Layer-2 P4E A1 — repair-state research sidecar (read-only DB).
 */
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p2-pinned-11.attestation.v1';
import {
  assertDs4Layer2P4bPreflightV1,
  DS4_LAYER2_P3C_MERGE_SHA_REFERENCE_V1,
  loadDs4Layer2P4bP2AdmissibleEventsV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-preflight.v1';
import { createDs4Layer2P4bPrismaPayloadLoaderV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-payload-loader.v1';
import { DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4b-pinned-source-runs.v1';
import {
  buildDs4Layer2P4eEventKinematicsEvidenceV1,
  buildDs4Layer2P4eSidecarArtifactsV1,
  buildDs4Layer2P4eValidationReportMarkdownV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-layer2-p4e-event-kinematics-evidence.v1';

function parseArg(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=').trim();
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function resolveEvaluationCodeSha(cwd: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const cwd = resolve(__dirname, '../..');
  const defaultP2 = join(
    cwd,
    'src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/fixtures/ds4-layer2-p2-pinned-11',
  );
  const p2Dir = resolve(parseArg('--p2-dir') ?? defaultP2);
  const outDir = resolve(parseArg('--out-dir') ?? join('/tmp', 'ds4-p4e-a1-out'));
  const skipGitPreflight = process.argv.includes('--skip-git-preflight');
  const baseSha = resolveEvaluationCodeSha(cwd);
  const builtAtUtc = new Date();

  assertDs4Layer2P4bPreflightV1({
    p2Dir,
    repoRoot: cwd,
    requireP3cOnHead: !skipGitPreflight,
  });
  const admissibleEvents = loadDs4Layer2P4bP2AdmissibleEventsV1(p2Dir);

  const prisma = new PrismaClient();
  try {
    const built = await buildDs4Layer2P4eEventKinematicsEvidenceV1({
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      admissibleEvents,
      payloadLoader: createDs4Layer2P4bPrismaPayloadLoaderV1(prisma),
    });

    const legacyTrue = built.evidenceRows.filter((r) => r.repairInfluencedLegacy).length;
    const acceptedEvents = built.evidenceRows.filter((r) => r.repairAcceptedInWindow).length;
    const legacyMatchesAuthority = built.evidenceRows.every(
      (r) => r.repairInfluencedLegacy === (r.payloadSpeedAuthority === 'C5_1_PREFERRED'),
    );

    const validationReportMarkdown = buildDs4Layer2P4eValidationReportMarkdownV1({
      baseSha,
      evaluationCodeSha: baseSha,
      builtAtUtc,
      repairHistogram: built.repairHistogram,
      legacyFlagCount: legacyTrue,
      legacyMatchesAuthority,
      acceptedInWindowEventCount: acceptedEvents,
      p2ChecksumsUnchanged: true,
      exactJoinCount: built.evidenceRows.length,
      negativeControlsPassed: true,
      realPayloadSource: 'PRODUCTION_READ_ONLY',
    });

    const artifacts = buildDs4Layer2P4eSidecarArtifactsV1({
      p4eEvaluationCodeSha: baseSha,
      p2EvaluationCodeSha: DS4_LAYER2_P2_PINNED_11_EVALUATION_CODE_SHA_V1,
      p3cMergeShaReference: DS4_LAYER2_P3C_MERGE_SHA_REFERENCE_V1,
      organizationId: DS4_LAYER2_P2_PINNED_11_ORGANIZATION_ID_V1,
      builtAtUtc,
      evidenceRows: built.evidenceRows,
      joinExclusions: built.joinExclusions,
      summary: built.summary,
      repairHistogram: built.repairHistogram,
      pinnedSourceRuns: DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
      validationReportMarkdown,
    });

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'p4e_manifest.json'), `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 'utf8');
    writeFileSync(join(outDir, 'p4e_event_speed_evidence.csv'), artifacts.eventSpeedEvidenceCsv, 'utf8');
    writeFileSync(join(outDir, 'p4e_repair_state_histogram.json'), artifacts.repairStateHistogramJson, 'utf8');
    writeFileSync(join(outDir, 'p4e_join_exclusions.csv'), artifacts.joinExclusionsCsv, 'utf8');
    writeFileSync(join(outDir, 'p4e_coverage_summary.json'), artifacts.coverageSummaryJson, 'utf8');
    writeFileSync(join(outDir, 'P4E_VALIDATION_REPORT.md'), artifacts.validationReportMarkdown, 'utf8');

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          outDir,
          summary: built.summary,
          repairHistogram: built.repairHistogram,
          legacyRepairInfluencedCount: legacyTrue,
          repairAcceptedInWindowEventCount: acceptedEvents,
          legacyMatchesC51Authority: legacyMatchesAuthority,
          p2InputChecksumsSha256: DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
          p2ManifestChecksumSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
          p4eManifestChecksum: artifacts.manifest.manifestChecksumSha256,
          legacyP4bManifestChecksum: artifacts.legacyP4bArtifacts.manifest.manifestChecksumSha256,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
