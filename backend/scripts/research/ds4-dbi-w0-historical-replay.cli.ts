/**
 * DS4 DBI W0 — historical Motion-Core offline replay (research only).
 *
 * Usage (from backend/):
 *   npm run research:ds4-dbi-w0-historical-replay -- --json
 *   npm run research:ds4-dbi-w0-historical-replay -- --fixture TIG22 --json
 */

import { join } from 'path';
import { computeDs4DbiW0MbfFromPayloadV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-mbf-kernel.v1';
import type { Ds4DbiW0TripKernelResultV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-mbf.types.v1';
import type { Ds4DbiW0HistoricalFixtureIdV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-replay.fixture-registry.v1';
import { buildDs4DbiW0HistoricalCohortD8ReportV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-cohort-d8.v1';
import { buildDs4DbiW0HistoricalD8CompatibilityReportV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-replay-d8-compat.v1';
import {
  loadDs4DbiW0HistoricalMotionFixtureV1,
  type Ds4DbiW0HistoricalReplayBindingTierV1,
  type Ds4DbiW0HistoricalReplayLoadResultV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/research/ds4-dbi-w0-historical-replay.loader.v1';

const repoRoot = join(__dirname, '../../..');

function parseArgs(): { json: boolean; fixtures: Ds4DbiW0HistoricalFixtureIdV1[] } {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const fixtureIdx = argv.indexOf('--fixture');
  const fixtures: Ds4DbiW0HistoricalFixtureIdV1[] =
    fixtureIdx >= 0 && argv[fixtureIdx + 1]
      ? [argv[fixtureIdx + 1] as Ds4DbiW0HistoricalFixtureIdV1]
      : ['TIG22', 'TES16'];
  return { json, fixtures };
}

function summarizeKernelMetricsV1(r: Ds4DbiW0TripKernelResultV1) {
  return {
    d4: r.d4SpeedVariabilityRobustCv,
    d5: r.d5SpeedRoughnessMeanAbsDeltaKmhPerS,
    d6: r.d6StopStructure,
    d8: r.d8Burstiness,
  };
}

function runFixtureReplay(input: {
  fixtureId: Ds4DbiW0HistoricalFixtureIdV1;
  bindingTier: Ds4DbiW0HistoricalReplayBindingTierV1;
  qualityTier: 'STRICT' | 'RELAXED';
}): {
  bindingTier: Ds4DbiW0HistoricalReplayBindingTierV1;
  qualityTier: 'STRICT' | 'RELAXED';
  load: Ds4DbiW0HistoricalReplayLoadResultV1;
  kernel: Ds4DbiW0TripKernelResultV1 | null;
} {
  const load = loadDs4DbiW0HistoricalMotionFixtureV1({
    fixtureId: input.fixtureId,
    bindingTier: input.bindingTier,
    repositoryRoot: repoRoot,
  });
  if (!load.ok) {
    return { bindingTier: input.bindingTier, qualityTier: input.qualityTier, load, kernel: null };
  }
  const kernel = computeDs4DbiW0MbfFromPayloadV1({
    payload: load.payload,
    tripMeta: load.tripMeta,
    qualityTier: input.qualityTier,
    expectedContentFingerprint: load.payloadFileSha256,
    expectedShadowBundleVersion: load.tripMeta.shadowBundleVersion,
    evidenceOrigin: 'HISTORICAL_RESEARCH_RECORDING',
  });
  return { bindingTier: input.bindingTier, qualityTier: input.qualityTier, load, kernel };
}

async function main(): Promise<void> {
  const { json, fixtures } = parseArgs();
  const report: Record<string, unknown> = {
    contractVersion: 'ds4-dbi-w0-historical-replay-cli-v1',
    repositoryRoot: repoRoot,
    independentScientificValidationStatus: 'NOT_EVALUATED',
    sealedRealC4StatisticalEligibility: false,
    fixtures: {} as Record<string, unknown>,
  };

  for (const fixtureId of fixtures) {
    const strictBinding = runFixtureReplay({ fixtureId, bindingTier: 'STRICT', qualityTier: 'STRICT' });
    const relaxedBindingStrictQ = runFixtureReplay({ fixtureId, bindingTier: 'RELAXED', qualityTier: 'STRICT' });
    const relaxedBindingRelaxedQ = runFixtureReplay({ fixtureId, bindingTier: 'RELAXED', qualityTier: 'RELAXED' });

    const entry: Record<string, unknown> = {
      strictBinding,
      relaxedBindingStrictQuality: relaxedBindingStrictQ,
      relaxedBindingRelaxedQuality: relaxedBindingRelaxedQ,
    };

    for (const run of [relaxedBindingStrictQ, relaxedBindingRelaxedQ]) {
      if (run.kernel) {
        entry.metricsSummary = {
          ...summarizeKernelMetricsV1(run.kernel),
          speedAuthorityBinding: run.load.ok ? run.load.speedAuthorityBinding : null,
          tripMeta: run.load.ok ? run.load.tripMeta : null,
          provenanceLimitations: run.load.ok ? run.load.provenanceLimitations : run.load.provenanceLimitations,
        };
        break;
      }
    }

    if (relaxedBindingStrictQ.load.ok) {
      entry.d8HistoricalCompatibility = buildDs4DbiW0HistoricalD8CompatibilityReportV1(
        relaxedBindingStrictQ.load,
      );
    }

    (report.fixtures as Record<string, unknown>)[fixtureId] = entry;
  }

  report.cohortD8Validation = buildDs4DbiW0HistoricalCohortD8ReportV1({
    fixtureIds: ['TIG22', 'TIG22_V4', 'TES16'],
    repositoryRoot: repoRoot,
  });

  report.videoReferenceNote =
    'Speed video references (TIG22/TES16) are kinematic ground truth only — not independent DBI style labels; no comparison emitted in this harness.';

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report);
  }
}

void main();
