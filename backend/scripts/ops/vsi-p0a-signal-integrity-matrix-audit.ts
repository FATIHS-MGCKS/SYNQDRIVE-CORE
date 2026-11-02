/**
 * P0-a — read-only VSI Signal Integrity Matrix audit (operator / CI fixture replay).
 *
 * Example:
 *   cd backend && npx ts-node --transpile-only scripts/ops/vsi-p0a-signal-integrity-matrix-audit.ts
 *
 * Env:
 *   DATABASE_URL — required for live audit
 *   VSI_P0A_OUTPUT_DIR — default: ../architecture/vehicle-signal-intelligence/evidence
 *   VSI_P0A_AUDIT_AT — ISO timestamp (default: now)
 *   VSI_P0A_PRODUCTION_VERIFICATION_JSON — optional JSON blob for production verification block
 *   VSI_P0A_SKIP_CLICKHOUSE=1 — skip bounded HF queries
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { resolveVsiP0aCohortFromEnv } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-audit-cohort.v1';
import { assembleVsiP0aMatrixDocument } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.engine';
import {
  formatVsiP0aMatrixJson,
  formatVsiP0aMatrixMarkdown,
} from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.format';
import {
  loadVsiP0aProfileBundles,
  mapGitAncestorResults,
} from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.loader';
import type { VsiP0aProductionVerification } from '../../src/modules/vehicle-intelligence/vehicle-signal-intelligence/vsi-p0a-signal-integrity-audit.types';

function parseAuditAt(): Date {
  const raw = process.env.VSI_P0A_AUDIT_AT?.trim();
  if (!raw) return new Date();
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) throw new Error('VSI_P0A_AUDIT_AT invalid');
  return d;
}

function loadProductionVerification(): VsiP0aProductionVerification {
  const raw = process.env.VSI_P0A_PRODUCTION_VERIFICATION_JSON?.trim();
  if (raw) {
    return JSON.parse(raw) as VsiP0aProductionVerification;
  }
  const base: Omit<VsiP0aProductionVerification, 'pr2255' | 'pr2256' | 'pr2257'> = {
    verifiedAt: new Date().toISOString(),
    originMainSha: process.env.VSI_P0A_ORIGIN_MAIN_SHA ?? 'NOT_VERIFIED',
    productionCurrentSha: process.env.VSI_P0A_PRODUCTION_SHA ?? 'NOT_VERIFIED',
    productionRelease: process.env.VSI_P0A_PRODUCTION_RELEASE ?? null,
    replica3001Sha: process.env.VSI_P0A_REPLICA_3001_SHA ?? null,
    replica3002Sha: process.env.VSI_P0A_REPLICA_3002_SHA ?? null,
    pm2Health: process.env.VSI_P0A_PM2_HEALTH ?? null,
    publicHealthOk: process.env.VSI_P0A_PUBLIC_HEALTH_OK === '1',
    frontendArtifact: {
      bundlePath: process.env.VSI_P0A_FRONTEND_BUNDLE ?? null,
      rpmDualPresent:
        process.env.VSI_P0A_FRONTEND_RPM_DUAL === '1' ? 'ARTIFACT_PRESENT' : 'NOT_VERIFIED',
      dualProvenanceTestIdPresent:
        process.env.VSI_P0A_FRONTEND_DUAL_TESTID === '1' ? 'ARTIFACT_PRESENT' : 'NOT_VERIFIED',
    },
    runtimeDualProvenanceUi: 'NOT_VERIFIED',
    notes: ['production verification supplied via env defaults — run VPS preflight for authoritative values'],
  };
  return mapGitAncestorResults({
    productionSha: base.productionCurrentSha,
    pr2255Present: process.env.VSI_P0A_PR2255_PRESENT === '1',
    pr2256Present: process.env.VSI_P0A_PR2256_PRESENT === '1',
    pr2257Present: process.env.VSI_P0A_PR2257_PRESENT === '1',
    base,
  });
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL required for P0-a live matrix audit');
  }

  const auditAt = parseAuditAt();
  const cohort = resolveVsiP0aCohortFromEnv();
  const prisma = new PrismaClient();
  const skipCh = process.env.VSI_P0A_SKIP_CLICKHOUSE !== '0';
  const bundles = await loadVsiP0aProfileBundles({
    prisma,
    cohort,
    projectionAsOf: auditAt,
    clickHouse: null,
    verifyClickHouse: false,
  });

  const doc = assembleVsiP0aMatrixDocument({
    auditExecutedAt: auditAt,
    auditTimezone: process.env.VSI_P0A_TIMEZONE ?? 'Europe/Berlin',
    productionVerification: loadProductionVerification(),
    cohort,
    bundles,
  });

  const dateSlug = auditAt.toISOString().slice(0, 10);
  const outDir =
    process.env.VSI_P0A_OUTPUT_DIR?.trim() ||
    path.join(__dirname, '../../../architecture/vehicle-signal-intelligence/evidence');
  fs.mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, `SIGNAL_INTEGRITY_MATRIX_${dateSlug}.md`);
  const jsonPath = path.join(outDir, `SIGNAL_INTEGRITY_MATRIX_${dateSlug}.json`);
  fs.writeFileSync(mdPath, formatVsiP0aMatrixMarkdown(doc), 'utf8');
  fs.writeFileSync(jsonPath, formatVsiP0aMatrixJson(doc), 'utf8');

  process.stdout.write(
    `${JSON.stringify({ mdPath, jsonPath, summary: doc.summary }, null, 2)}\n`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
