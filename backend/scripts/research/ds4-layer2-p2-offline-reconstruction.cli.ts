#!/usr/bin/env npx ts-node
/**
 * DS4 Layer-2 P2 offline reconstruction pilot — read-only motion SELECT; writes research artifacts only.
 *
 * SAFETY: Does not persist assessments. Requires DS4_LAYER2_P2_PRODUCTION_RECONSTRUCTION_AUTHORIZED=1
 * before opening a production DATABASE_URL (separate human authorization).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { assertEvaluationCodeCheckoutAttestationForLayer2P2OfflineV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction-evaluation-attestation.v1';
import { buildDs4Layer2P2OfflineArtifactsV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.artifacts.v1';
import {
  DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1,
  DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.cohort.v1';
import { loadDs4Layer2P2OfflinePilotReconstructionRowsV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-p2-offline-reconstruction.loader.v1';
import { isExportOutputDirectoryOutsideCheckoutV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-historical-export-evaluation-attestation.v1';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function assertProductionReconstructionAuthorized(): void {
  if (process.env.DS4_LAYER2_P2_PRODUCTION_RECONSTRUCTION_AUTHORIZED === '1') {
    return;
  }
  throw new Error(
    'Refusing database reconstruction: set DS4_LAYER2_P2_PRODUCTION_RECONSTRUCTION_AUTHORIZED=1 only after explicit operator authorization',
  );
}

async function main(): Promise<void> {
  const organizationId = parseArg('--organization-id') ?? DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1;
  const outDir = parseArg('--out-dir');
  const deployShaAssertion = parseArg('--deploy-sha');
  const feasibilityAuditProductionSha = parseArg('--feasibility-audit-production-sha');

  if (!outDir) {
    throw new Error('--out-dir is required');
  }
  if (!isExportOutputDirectoryOutsideCheckoutV1(outDir, REPO_ROOT)) {
    throw new Error('--out-dir must be outside the git checkout to avoid attestation pollution');
  }

  assertProductionReconstructionAuthorized();

  const { evaluationCodeSha } = assertEvaluationCodeCheckoutAttestationForLayer2P2OfflineV1({
    cwd: REPO_ROOT,
    deployShaAssertion,
  });

  const prisma = new PrismaClient();
  try {
    const reconstructedAt = new Date();
    const loaded = await loadDs4Layer2P2OfflinePilotReconstructionRowsV1(prisma, organizationId, {
      evaluationCodeSha,
      reconstructedAt,
    });

    const artifacts = buildDs4Layer2P2OfflineArtifactsV1({
      organizationId,
      evaluationCodeSha,
      reconstructedAt,
      feasibilityAuditProductionSha: feasibilityAuditProductionSha ?? null,
      revisionSelectionPolicy: loaded.revisionSelectionPolicy,
      rows: loaded.rows,
      revisionRows: loaded.revisionRows,
    });

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'p2_manifest.json'), `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(outDir, 'p2_reconstructed_assessments.csv'), artifacts.reconstructedAssessmentsCsv, 'utf8');
    fs.writeFileSync(path.join(outDir, 'p2_longitudinal_events.csv'), artifacts.longitudinalEventsCsv, 'utf8');
    fs.writeFileSync(path.join(outDir, 'p2_exclusions.csv'), artifacts.exclusionsCsv, 'utf8');
    fs.writeFileSync(path.join(outDir, 'p2_revision_selection.csv'), artifacts.revisionSelectionCsv, 'utf8');
    fs.writeFileSync(
      path.join(outDir, 'p2_coverage_summary.json'),
      `${JSON.stringify(artifacts.coverageSummary, null, 2)}\n`,
      'utf8',
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          operation: 'DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_PILOT',
          organizationId,
          evaluationCodeSha,
          cohortTripIds: DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.map((c) => c.tripId),
          reconstructedTrips: loaded.rows.length,
          outDir,
          fileChecksumsSha256: artifacts.fileChecksums,
          readOnly: true,
          persistedAssessmentsWritten: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
