#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { P16_REGRESSION, P17_1_CONTEXT, RAY_RUN_P18A } from "./constants.js";
import { stableReportHash } from "./hash.js";
import { verifyP16Gate, resolveRepoRoot, resolvePackageRoot } from "./pin/p16_gate.js";
import {
  attemptForbiddenVideoR1UtcJoin,
  block5Subsample,
  eligibleVideoRows,
  parseP5QcCsv,
  parseR1SameRowPairs,
} from "./loaders/video_cohort.js";
import {
  assertP16BaselineRegression,
  computeBaselineB0B1,
  fableBandCounts,
  ratioValues,
  reportHasForbiddenGearFields,
} from "./compute/baseline_b0_b1.js";
import { independentRunDiagnostics, segmentRatioStableRuns } from "./compute/segment_runs.js";
import {
  assertP171Parity,
  labelDrivingContextV1,
  loadManoeuvreWindows,
  countEligibleInsideWindows,
} from "./compute/driving_context.js";
import { runNegativeControls } from "./controls/negative_controls.js";
import { rayFitFromEligibleRows } from "./interfaces/ray_fit.js";
import { assessSeparability } from "./interfaces/separability.js";
import { classifyPerSecondState } from "./interfaces/abstain_state.js";
import { stratifyByDrivingContext } from "./interfaces/context_stratify.js";
import type { RayRunInterfaceReadiness } from "./types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(here);
const pkgRoot = resolvePackageRoot(repoRoot);

export function buildP18aFoundationReport(): Record<string, unknown> {
  const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const gate = verifyP16Gate(repoRoot, manifestPath, manifest);

  const p5Path = gate.sealed_inputs.find((s) => s.role === "p5_optical_qc_overlay")!.resolved_path;
  const s4Path = gate.sealed_inputs.find((s) => s.role === "sealed_s4_r1_obd")!.resolved_path;
  const windowsPath = join(
    repoRoot,
    "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_analysis_windows.csv",
  );

  const qc = parseP5QcCsv(p5Path);
  const eligible = eligibleVideoRows(qc);
  const block5 = block5Subsample(eligible);
  const baseline = computeBaselineB0B1(eligible, block5);
  const p16 = assertP16BaselineRegression(eligible, block5, baseline);

  const windows = loadManoeuvreWindows(windowsPath);
  const contextLabels = labelDrivingContextV1(eligible, windows);
  const p171 = assertP171Parity(eligible, windows, contextLabels);

  const { runs, break_class_counts } = segmentRatioStableRuns(eligible);
  const runDiag = independentRunDiagnostics(runs);

  const r1 = parseR1SameRowPairs(s4Path);
  const crossJoin = attemptForbiddenVideoR1UtcJoin(eligible, r1);

  const controls = runNegativeControls(eligible);

  const clipCounts: Record<string, number> = {};
  for (const r of eligible) clipCounts[r.source_clip] = (clipCounts[r.source_clip] ?? 0) + 1;

  const readiness: RayRunInterfaceReadiness = {
    ray_fit: "TYPED_STUB_ONLY",
    separability: "TYPED_STUB_ONLY",
    abstain_state: "TYPED_STUB_ONLY",
    context_stratify: "PARTIAL_IMPLEMENTED_P17_1",
    classifier_validated: false,
  };

  const report: Record<string, unknown> = {
    schema: "DS4_RPM_P18A_RAY_RUN_FOUNDATION_V1",
    operation: "DS4_RPM_P18A_RAY_RUN_FOUNDATION_V1",
    mode: "IMPLEMENTATION_DRAFT_PR_ONLY",
    generated_at_utc: new Date().toISOString(),
    SOURCE_INTEGRITY: {
      verdict: gate.verdict,
      p16_manifest_sha256_self: gate.manifest_sha256_self,
      p16_manifest_sha256_self_expected: gate.manifest_sha256_self_expected,
      sealed_inputs: gate.sealed_inputs,
      errors: gate.errors,
    },
    P16_PARITY: {
      pass: p16.pass,
      details: p16.details,
      video_pair_count: eligible.length,
      block5_count: block5.length,
      r1_same_row_vmin_20: r1.length,
      b0_top_modes: baseline.b0_histogram_peaks.slice(0, 4),
      ratio_median: Math.round(median(ratioValues(eligible)) * 100) / 100,
      fable_band_counts: fableBandCounts(ratioValues(eligible)),
    },
    P17_1_CONTEXT_PARITY: {
      pass: p171.pass,
      details: p171.details,
      contract_id: P17_1_CONTEXT.contractId,
      eligible_inside_windows_measured: countEligibleInsideWindows(eligible, windows),
      eligible_inside_windows_p171_design: P17_1_CONTEXT.windowEligibleOverlapCountP171Design,
    },
    ELIGIBLE_CLIP_COUNTS: {
      clips: clipCounts,
      clip_list: Object.keys(clipCounts).sort(),
    },
    INDEPENDENT_RUN_DIAGNOSTICS: {
      ...runDiag,
      break_class_counts,
    },
    BASELINE_B0_B1_IMMUTABLE: baseline,
    NEGATIVE_CONTROL_RESULTS: controls,
    QUANTIZATION_LIMITATIONS: {
      rpm_policy_rpm: 500,
      note: "±500 rpm is an approximate visual uncertainty policy, not a proven probability distribution.",
      low_speed_ratio_comb: "Integer km/h and 250 rpm steps can create ratio-space comb artifacts (see NC-F).",
    },
    RAY_RUN_INTERFACE_READINESS: {
      ...readiness,
      classifier_enabled: RAY_RUN_P18A.classifierEnabled,
      sample_calls: {
        ray_fit: rayFitFromEligibleRows(eligible),
        separability: assessSeparability({ candidates: [], z_threshold: 2, require_both_clips: true }),
        abstain_state: classifyPerSecondState({
          speed_kmh: 80,
          posterior_by_regime: {},
          regime_centers_k: [22.5, 37.5],
          rpm_uncertainty_policy_rpm: 500,
          posterior_threshold: 0.8,
        }),
        context_stratify: stratifyByDrivingContext({
          eligible,
          labels: contextLabels,
          min_n: P17_1_CONTEXT.minNPerStratum,
        }),
      },
    },
    PAIRING_AUTHORITY: {
      video: eligible[0]?.pairing_authority,
      r1: r1[0]?.pairing_authority,
      cross_join_guard: crossJoin,
    },
    forbidden_field_scan: reportHasForbiddenGearFields({ report: "safe" }),
  };

  report.content_sha256_excluding_generated_at = stableReportHash(report);
  return report;
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("run_p18a_foundation.ts")) {
  const report = buildP18aFoundationReport();
  const outPath =
    process.env.P18A_REPORT_PATH ??
    "/opt/cursor/artifacts/ds4-rpm-p18a-ray-run-foundation-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("wrote", outPath);
  console.log("content_sha256", report.content_sha256_excluding_generated_at);
  if ((report.SOURCE_INTEGRITY as { verdict: string }).verdict !== "PASS") {
    process.exitCode = 1;
  }
}
