/**
 * TDL_CUSUM_FINALIZATION_REPLAY_EVIDENCE_V1 — offline deterministic replay only.
 *
 * Replays production FSM/CUSUM semantics on pinned fixtures; compares counterfactuals
 * A (FSM/retry), B (time-aware CUSUM, research-only), C (CH assist / provider silence).
 *
 * cd backend && npx ts-node --transpile-only scripts/research/tdl-cusum-finalization-replay-v1.harness.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectTripEndChangePoint, type CusumOptions, type CusumResult } from '../../src/modules/vehicle-intelligence/trips/trip-cusum';
import type { TripCoreDataPoint } from '../../src/modules/dimo/dimo-segments.service';

const repoRoot = path.resolve(__dirname, '../../..');
const fixtureDir = path.join(
  repoRoot,
  'architecture/trip-detection-lifecycle/evidence/TDL_CUSUM_REPLAY_FIXTURES_V1',
);
const artifactsDir = process.env.TDL_REPLAY_ARTIFACTS_DIR || '/opt/cursor/artifacts';

const PRODUCTION_SHA = 'a27ca9059b9fa9e8aa88696e811107fb427cb369';
const OPERATION = 'TDL_CUSUM_FINALIZATION_REPLAY_EVIDENCE_V1';

type FsmDefaults = {
  tripEndStabilityWindowMs: number;
  tripEndMinInactivityBeforeCusumMs: number;
  tripEndValidationRetryMs: number;
  tripEndValidationMaxAttempts: number;
  workerTripTrackingIntervalMs: number;
  tripEndChAssistStabilityMs: number;
  tripEndChAssistMinStationaryMs: number;
  tripEndChAssistMinTripDurationMs: number;
};

type ReplayFixture = {
  fixtureId: string;
  tripId: string;
  provider: string;
  production: {
    endMode: string;
    endToRecognizedLagSec: number | null;
    cusumOutcome: string;
  };
  replayScope?: 'END_VALIDATION' | 'GAP_SPLIT_EXCLUDED';
  fsm: {
    possibleEndAt: string;
    canonicalEndTime: string;
    lastMovementAt: string;
    tripDurationMs: number;
    providerSilenceEmptyCore: boolean;
    chAssistEligible: boolean;
    chSegmentEndAt?: string | null;
  };
  points: TripCoreDataPoint[];
};

type VariantKey = 'BASELINE' | 'A_FSM_RETRY' | 'B_TIME_AWARE_CUSUM' | 'C_CH_SILENCE';

type SimOutcome = {
  variant: VariantKey;
  cusum: CusumResult;
  finalizeMode: string;
  cusumAttemptsUsed: number;
  estimatedFinalizeLagSec: number;
  notes: string[];
};

function loadManifest(): { fsmDefaultsMs: FsmDefaults; fixtures: { file: string }[] } {
  const raw = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'));
  return raw;
}

function loadFixture(file: string): ReplayFixture {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8'));
}

function msBetween(a: string | Date, b: string | Date): number {
  return new Date(b).getTime() - new Date(a).getTime();
}

/** Production CUSUM (imported from trip-cusum.ts). */
function runProductionCusum(points: TripCoreDataPoint[], opts?: CusumOptions): CusumResult {
  const sorted = [...points].sort(
    (x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime(),
  );
  return detectTripEndChangePoint(sorted, opts);
}

/**
 * Research-only time-aware CUSUM: confirmation uses wall-clock stopped fraction;
 * CUSUM steps weighted by inter-sample seconds / 30s reference cadence.
 */
function detectTripEndChangePointTimeAware(
  points: TripCoreDataPoint[],
  opts: CusumOptions = {},
): CusumResult {
  const o = {
    stoppedThresholdKmh: 2,
    targetActiveMean: 0.3,
    slackK: 0.2,
    decisionThresholdH: 3.0,
    minConfirmationPoints: 3,
    minConfirmationFraction: 0.75,
    ...opts,
  };
  const sorted = [...points].sort(
    (x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime(),
  );
  const n = sorted.length;
  if (n < 4) {
    return runProductionCusum(sorted, opts);
  }

  const stopped = sorted.map((p) => p.speed == null || p.speed <= o.stoppedThresholdKmh!);
  const ts = sorted.map((p) => new Date(p.timestamp).getTime());

  const lastFiveActive = stopped.slice(-5).filter((s) => !s).length >= 3;
  if (lastFiveActive) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt: new Date(ts[n - 1]),
      appearsOngoing: true,
      confidence: 'MEDIUM',
      reason: 'still_active_at_window_end',
      analyzedPoints: n,
    };
  }

  let lastMovementIdx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (!stopped[i]) {
      lastMovementIdx = i;
      break;
    }
  }
  const lastMovementAt = lastMovementIdx >= 0 ? new Date(ts[lastMovementIdx]) : null;
  if (lastMovementIdx < 0) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt: null,
      appearsOngoing: false,
      confidence: 'LOW',
      reason: 'all_stopped_from_start',
      analyzedPoints: n,
    };
  }

  const S: number[] = new Array(n).fill(0);
  let changePointIdx = -1;
  for (let i = 1; i < n; i++) {
    const deltaSec = Math.max(1, (ts[i] - ts[i - 1]) / 1000);
    const weight = Math.min(1.5, deltaSec / 30);
    const x = stopped[i] ? weight : 0;
    S[i] = Math.max(0, S[i - 1] + x - o.targetActiveMean! - o.slackK!);
    if (S[i] >= o.decisionThresholdH! && changePointIdx < 0) {
      changePointIdx = i;
    }
  }

  if (changePointIdx < 0) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt,
      appearsOngoing: false,
      confidence: 'LOW',
      reason: 'cusum_threshold_not_crossed',
      analyzedPoints: n,
    };
  }

  let transitionIdx = changePointIdx;
  for (let i = changePointIdx; i >= 1; i--) {
    if (S[i - 1] <= 0) {
      transitionIdx = i;
      break;
    }
  }
  const estimatedEndIdx = Math.max(transitionIdx, lastMovementIdx + 1);

  let stoppedMs = 0;
  let totalMs = 0;
  for (let i = estimatedEndIdx; i < n; i++) {
    const segMs = i === estimatedEndIdx ? 0 : ts[i] - ts[i - 1];
    totalMs += segMs;
    if (stopped[i]) stoppedMs += segMs;
  }
  const tailSpanMs = ts[n - 1] - ts[estimatedEndIdx];
  totalMs = Math.max(totalMs, tailSpanMs);
  const stoppedFraction = totalMs > 0 ? stoppedMs / totalMs : 0;
  const minConfirmMs = 90_000;

  if (totalMs < minConfirmMs || stoppedFraction < o.minConfirmationFraction!) {
    return {
      changePointDetected: false,
      changePointAt: null,
      lastMovementAt,
      appearsOngoing: false,
      confidence: 'LOW',
      reason: 'insufficient_confirmation_after_change_point_time_aware',
      analyzedPoints: n,
    };
  }

  const confidence: CusumResult['confidence'] =
    stoppedFraction >= 0.95 ? 'HIGH' : stoppedFraction >= 0.8 ? 'MEDIUM' : 'LOW';

  return {
    changePointDetected: true,
    changePointAt: new Date(ts[estimatedEndIdx]),
    lastMovementAt,
    appearsOngoing: false,
    confidence,
    reason: `time_aware_cusum_confirmed stoppedFraction=${Math.round(stoppedFraction * 100)}% spanMs=${totalMs}`,
    analyzedPoints: n,
  };
}

function gateBeforeCusumMs(defaults: FsmDefaults, variant: VariantKey): number {
  const stability = variant === 'A_FSM_RETRY' ? 60_000 : defaults.tripEndStabilityWindowMs;
  const inactivity =
    variant === 'A_FSM_RETRY' ? 90_000 : defaults.tripEndMinInactivityBeforeCusumMs;
  return Math.max(stability, inactivity);
}

function maxAttempts(defaults: FsmDefaults, variant: VariantKey): number {
  return variant === 'A_FSM_RETRY' ? 2 : defaults.tripEndValidationMaxAttempts;
}

function retryMs(defaults: FsmDefaults, variant: VariantKey): number {
  return variant === 'A_FSM_RETRY' ? 45_000 : defaults.tripEndValidationRetryMs;
}

function quantizeTickMs(defaults: FsmDefaults, variant: VariantKey): number {
  return variant === 'A_FSM_RETRY' ? 20_000 : defaults.workerTripTrackingIntervalMs;
}

/** Match production END_VALIDATION core fetch: possibleEnd −15min … +5min. */
function coreWindowPoints(fixture: ReplayFixture): TripCoreDataPoint[] {
  const pe = new Date(fixture.fsm.possibleEndAt).getTime();
  const from = pe - 15 * 60_000;
  const to = pe + 5 * 60_000;
  return fixture.points
    .filter((p) => {
      const t = new Date(p.timestamp).getTime();
      return t >= from && t <= to;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function simulateFsmPath(
  fixture: ReplayFixture,
  defaults: FsmDefaults,
  variant: VariantKey,
  cusumFn: (pts: TripCoreDataPoint[]) => CusumResult,
): SimOutcome {
  const notes: string[] = [];
  const corePoints = coreWindowPoints(fixture);
  if (corePoints.length < fixture.points.length) {
    notes.push(`CUSUM window ${corePoints.length}/${fixture.points.length} points (15m lookback / 5m lookahead)`);
  }
  const { fsm } = fixture;
  const canonicalEnd = fsm.canonicalEndTime;
  const possibleEnd = fsm.possibleEndAt;

  if (fixture.replayScope === 'GAP_SPLIT_EXCLUDED') {
    return {
      variant,
      cusum: {
        changePointDetected: false,
        changePointAt: null,
        lastMovementAt: new Date(fsm.lastMovementAt),
        appearsOngoing: false,
        confidence: 'LOW',
        reason: 'gap_split_fsm_path_excluded_from_cusum_replay',
        analyzedPoints: corePoints.length,
      },
      finalizeMode: 'MID_TRIP_GAP_SPLIT',
      cusumAttemptsUsed: 0,
      estimatedFinalizeLagSec: fixture.production.endToRecognizedLagSec ?? 0,
      notes: ['Gap-split parent finalize dominated by reconciliation FSM — END_VALIDATION replay not comparable'],
    };
  }

  if (variant === 'C_CH_SILENCE') {
    if (fsm.providerSilenceEmptyCore && !fsm.chAssistEligible) {
      const gateMs = gateBeforeCusumMs(defaults, variant);
      const finalizeAt = new Date(new Date(possibleEnd).getTime() + gateMs + quantizeTickMs(defaults, variant));
      return {
        variant,
        cusum: {
          changePointDetected: false,
          changePointAt: null,
          lastMovementAt: new Date(fsm.lastMovementAt),
          appearsOngoing: false,
          confidence: 'MEDIUM',
          reason: 'provider_silence_skip_cusum_counterfactual',
          analyzedPoints: corePoints.length,
        },
        finalizeMode: 'PROVIDER_SILENCE_FAST_FINALIZE',
        cusumAttemptsUsed: 0,
        estimatedFinalizeLagSec: Math.round(msBetween(canonicalEnd, finalizeAt) / 1000),
        notes: [
          'Counterfactual C: empty-core provider silence → finalize after inactivity/stability gate without CUSUM retry budget',
        ],
      };
    }
  }

  if (
    variant === 'C_CH_SILENCE' &&
    fsm.chAssistEligible
  ) {
    const chStability = defaults.tripEndChAssistStabilityMs;
    const stationaryOk = fsm.tripDurationMs >= defaults.tripEndChAssistMinTripDurationMs;
    if (fsm.chAssistEligible && stationaryOk && fsm.chSegmentEndAt) {
      const lagSec = Math.round(
        msBetween(canonicalEnd, fsm.chSegmentEndAt) / 1000 +
          chStability / 1000 +
          quantizeTickMs(defaults, variant) / 1000,
      );
      return {
        variant,
        cusum: {
          changePointDetected: false,
          changePointAt: null,
          lastMovementAt: new Date(fsm.lastMovementAt),
          appearsOngoing: false,
          confidence: 'HIGH',
          reason: 'clickhouse_end_assist_skip_cusum',
          analyzedPoints: corePoints.length,
        },
        finalizeMode: 'CLICKHOUSE_END_ASSIST',
        cusumAttemptsUsed: 0,
        estimatedFinalizeLagSec: Math.max(0, lagSec),
        notes: ['CUSUM skipped; CH segment end + stability path'],
      };
    }
  }

  const gateMs = gateBeforeCusumMs(defaults, variant);
  const firstCusumAt = new Date(new Date(possibleEnd).getTime() + gateMs);
  notes.push(`CUSUM gate ${gateMs / 1000}s after possibleEndAt`);

  let attempts = 0;
  let lastCusum: CusumResult = cusumFn(corePoints);
  const attemptsMax = maxAttempts(defaults, variant);
  const retry = retryMs(defaults, variant);
  let finalizeAt = firstCusumAt.getTime();

  while (attempts < attemptsMax) {
    attempts++;
    lastCusum = cusumFn(corePoints);
    if (lastCusum.changePointDetected) {
      finalizeAt =
        new Date(lastCusum.changePointAt ?? fsm.lastMovementAt).getTime() +
        quantizeTickMs(defaults, variant);
      return {
        variant,
        cusum: lastCusum,
        finalizeMode: 'CUSUM_VALIDATED',
        cusumAttemptsUsed: attempts,
        estimatedFinalizeLagSec: Math.round(msBetween(canonicalEnd, new Date(finalizeAt)) / 1000),
        notes,
      };
    }
    if (attempts < attemptsMax) {
      finalizeAt = firstCusumAt.getTime() + attempts * retry;
      notes.push(`attempt ${attempts}: ${lastCusum.reason} → retry +${retry / 1000}s`);
    }
  }

  finalizeAt += quantizeTickMs(defaults, variant);
  return {
    variant,
    cusum: lastCusum,
    finalizeMode: 'COMPOSITE_INACTIVITY',
    cusumAttemptsUsed: attempts,
    estimatedFinalizeLagSec: Math.round(msBetween(canonicalEnd, new Date(finalizeAt)) / 1000),
    notes: [...notes, 'max_completed_cusum_attempts_fallback'],
  };
}

function runFixture(fixture: ReplayFixture, defaults: FsmDefaults) {
  const baseline = simulateFsmPath(fixture, defaults, 'BASELINE', runProductionCusum);
  const variantA = simulateFsmPath(fixture, defaults, 'A_FSM_RETRY', runProductionCusum);
  const variantB = simulateFsmPath(fixture, defaults, 'BASELINE', detectTripEndChangePointTimeAware);
  const variantC = simulateFsmPath(fixture, defaults, 'C_CH_SILENCE', runProductionCusum);

  return {
    fixtureId: fixture.fixtureId,
    tripId: fixture.tripId,
    production: fixture.production,
    baseline,
    counterfactuals: {
      A_FSM_RETRY: variantA,
      B_TIME_AWARE_CUSUM: { ...variantB, variant: 'B_TIME_AWARE_CUSUM' as VariantKey },
      C_CH_SILENCE: variantC,
    },
  };
}

function main(): void {
  const manifest = loadManifest();
  const defaults = manifest.fsmDefaultsMs;
  const results: ReturnType<typeof runFixture>[] = [];

  for (const entry of manifest.fixtures) {
    results.push(runFixture(loadFixture(entry.file), defaults));
  }

  const summaryRows = results.map((r) => ({
    fixtureId: r.fixtureId,
    tripId: r.tripId,
    prodLagSec: r.production.endToRecognizedLagSec,
    prodMode: r.production.endMode,
    baselineMode: r.baseline.finalizeMode,
    baselineLagSec: r.baseline.estimatedFinalizeLagSec,
    baselineCusumReason: r.baseline.cusum.reason,
    A_lagSec: r.counterfactuals.A_FSM_RETRY.estimatedFinalizeLagSec,
    A_mode: r.counterfactuals.A_FSM_RETRY.finalizeMode,
    B_lagSec: r.counterfactuals.B_TIME_AWARE_CUSUM.estimatedFinalizeLagSec,
    B_mode: r.counterfactuals.B_TIME_AWARE_CUSUM.finalizeMode,
    B_cusumReason: r.counterfactuals.B_TIME_AWARE_CUSUM.cusum.reason,
    C_lagSec: r.counterfactuals.C_CH_SILENCE.estimatedFinalizeLagSec,
    C_mode: r.counterfactuals.C_CH_SILENCE.finalizeMode,
  }));

  fs.mkdirSync(artifactsDir, { recursive: true });
  const outJson = path.join(artifactsDir, 'tdl-cusum-replay-evidence-v1.json');
  const outCsv = path.join(artifactsDir, 'tdl-cusum-replay-comparison-v1.csv');
  const outMd = path.join(artifactsDir, 'tdl-cusum-finalization-replay-evidence-v1-report.md');

  fs.writeFileSync(
    outJson,
    JSON.stringify(
      {
        operation: OPERATION,
        productionSha: PRODUCTION_SHA,
        replayMode: 'OFFLINE_FIXTURE_ONLY',
        productionMutations: 'NONE',
        results,
      },
      null,
      2,
    ),
  );

  const csvHeader =
    'fixtureId,tripId,prodLagSec,prodMode,baselineLagSec,baselineMode,A_lagSec,A_mode,B_lagSec,B_mode,C_lagSec,C_mode';
  const csvBody = summaryRows
    .map((row) =>
      [
        row.fixtureId,
        row.tripId,
        row.prodLagSec ?? '',
        row.prodMode,
        row.baselineLagSec,
        row.baselineMode,
        row.A_lagSec,
        row.A_mode,
        row.B_lagSec,
        row.B_mode,
        row.C_lagSec,
        row.C_mode,
      ].join(','),
    )
    .join('\n');
  fs.writeFileSync(outCsv, `${csvHeader}\n${csvBody}\n`);

  const md = buildReportMd(summaryRows, results);
  fs.writeFileSync(outMd, md);

  console.log(`OPERATION=${OPERATION}`);
  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outCsv}`);
  console.log(`Wrote ${outMd}`);
  console.log(JSON.stringify(summaryRows, null, 2));
}

function buildReportMd(
  summaryRows: Record<string, unknown>[],
  results: ReturnType<typeof runFixture>[],
): string {
  const lines: string[] = [
    '# TDL CUSUM Finalization Offline Replay Evidence',
    '',
    `OPERATION=${OPERATION}`,
    `PRODUCTION_SHA=${PRODUCTION_SHA}`,
    'REPLAY_MODE=OFFLINE_FIXTURE_ONLY',
    'PRODUCTION_MUTATIONS=NONE',
    '',
    '## Comparison table (estimated finalize lag sec from canonical end_time)',
    '',
    '| fixture | prod lag | baseline | A FSM | B time-CUSUM | C CH/silence |',
    '|---------|----------|----------|-------|--------------|--------------|',
  ];
  for (const row of summaryRows as Array<{
    fixtureId: string;
    prodLagSec: number | null;
    baselineLagSec: number;
    A_lagSec: number;
    B_lagSec: number;
    C_lagSec: number;
  }>) {
    lines.push(
      `| ${row.fixtureId} | ${row.prodLagSec ?? 'n/a'} | ${row.baselineLagSec} | ${row.A_lagSec} | ${row.B_lagSec} | ${row.C_lagSec} |`,
    );
  }
  lines.push('', '## Safety notes', '');
  for (const r of results) {
    lines.push(`### ${r.fixtureId}`);
    lines.push(`- Production: ${r.production.endMode} (${r.production.cusumOutcome})`);
    lines.push(`- Baseline CUSUM: ${r.baseline.cusum.reason}`);
    if (r.baseline.finalizeMode === 'COMPOSITE_INACTIVITY') {
      lines.push('- **False-end risk (baseline): MEDIUM** after CUSUM exhaustion without independent stop proof');
    }
    if (r.counterfactuals.A_FSM_RETRY.finalizeMode === 'COMPOSITE_INACTIVITY') {
      lines.push('- **A risk**: shorter retry budget may finalize earlier on same inconclusive CUSUM — tune only with silence proofs');
    }
    if (r.counterfactuals.B_TIME_AWARE_CUSUM.finalizeMode === 'CUSUM_VALIDATED') {
      lines.push('- **B**: time-aware confirmation triggered where sample-index CUSUM failed — requires Fable review for sparse R1');
    }
    if (r.counterfactuals.C_CH_SILENCE.finalizeMode === 'CLICKHOUSE_END_ASSIST') {
      lines.push('- **C**: CH assist path reduces lag; resume-invalidation specs must remain green');
    }
    lines.push('');
  }
  return lines.join('\n');
}

main();
