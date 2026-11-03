/**
 * DS4 × RPM HF shadow correlation harness (Phase 0 research only).
 *
 * Usage:
 *   cd backend && npx ts-node --transpile-only scripts/research/ds4-rpm-shadow-correlation-harness.cli.ts
 *
 * Writes JSON artifacts under DS4_RPM_SHADOW_CORRELATION_OUT (default /opt/cursor/artifacts/ds4-rpm-shadow-correlation).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS,
  replayDs4RpmShadowCorrelationScenario,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-rpm-shadow-correlation/__tests__/ds4-rpm-shadow-correlation-scenarios.harness';
import { buildDs4RpmShadowCorrelationCohortReport } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-report.v1';
import { DS4_RPM_SHADOW_CORRELATION_DATASET_GAPS } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-rpm-shadow-correlation/ds4-rpm-shadow-correlation-harness.v1';

function resolveCodeSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const OUT_DIR =
  process.env.DS4_RPM_SHADOW_CORRELATION_OUT ?? '/opt/cursor/artifacts/ds4-rpm-shadow-correlation';

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const codeSha = resolveCodeSha();
  const generatedAt = new Date();

  const tripReports = DS4_RPM_SHADOW_CORRELATION_SCENARIO_IDS.map((scenarioId) => {
    const report = replayDs4RpmShadowCorrelationScenario(scenarioId, { codeSha, generatedAt });
    writeFileSync(join(OUT_DIR, `trip-${scenarioId}.json`), JSON.stringify(report, null, 2));
    return report;
  });

  const cohort = buildDs4RpmShadowCorrelationCohortReport({
    cohortId: 'ds4-rpm-shadow-correlation-fixture-cohort-v1',
    tripReports,
    datasetGaps: [...DS4_RPM_SHADOW_CORRELATION_DATASET_GAPS],
    codeSha,
    generatedAt,
  });

  writeFileSync(join(OUT_DIR, 'cohort-summary.json'), JSON.stringify(cohort, null, 2));

  const manifest = {
    codeSha,
    generatedAtIso: generatedAt.toISOString(),
    baselineNote: 'Fixture replay only — no production DB/CH reads',
    productionMainDrift: 'Not evaluated in CLI v1',
    datasetGaps: cohort.aggregate.datasetGaps,
    fableQuestionsPrepared: [
      'What maximum bucket-aware temporal skew still yields descriptive (non-load) RPM context at DS4 manoeuvre boundaries?',
      'Does RPM reference-band context change interpretability of eligibility-gated events beyond speed intensity alone?',
    ],
    goNoGo: 'NO-GO for product integration until owner review of cohort-summary.json',
  };
  writeFileSync(join(OUT_DIR, 'provenance-manifest.json'), JSON.stringify(manifest, null, 2));

  // eslint-disable-next-line no-console
  console.log(`Wrote ${tripReports.length} trip reports + cohort summary to ${OUT_DIR}`);
}

main();
