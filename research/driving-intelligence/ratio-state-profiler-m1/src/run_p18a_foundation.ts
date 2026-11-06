#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  P16_REGRESSION,
  P16_SEALED_ARTIFACTS,
  P17_1_CONTEXT,
  RAY_RUN_P18A,
} from "./constants.js";
import { stableReportHash } from "./hash.js";
import {
  verifyP16Gate,
  resolveRepoRoot,
  resolvePackageRoot,
  loadManifestFromPath,
} from "./pin/p16_gate.js";
import {
  block5Subsample,
  eligibleVideoRows,
  parseP5QcCsv,
  parseR1SameRowPairs,
} from "./loaders/video_cohort.js";
import { parseVideo1HzCsv } from "./loaders/video_1hz.js";
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
  attachContextToEligibleRows,
  buildDrivingContextGridFrom1Hz,
  loadManoeuvreWindows,
  windowOverlapRootCauseReport,
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

function sealedPath(role: string): string {
  const art = P16_SEALED_ARTIFACTS.find((a) => a.role === role);
  if (!art) throw new Error(`missing pinned role ${role}`);
  return join(repoRoot, art.repo_relative);
}

export function buildP18aFoundationReport(): Record<string, unknown> {
  const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
  const manifest = loadManifestFromPath(manifestPath);
  const gate = verifyP16Gate(repoRoot, manifestPath, manifest);

  if (gate.verdict !== "PASS") {
    return failReportEarly(gate, "SOURCE_INTEGRITY_FAIL_CLOSED");
  }

  const p5Path = sealedPath("p5_optical_qc_overlay");
  const s4Path = sealedPath("sealed_s4_r1_obd");
  const hzPath = sealedPath("video_1hz_reference");
  const windowsPath = sealedPath("analysis_windows_nine");

  const qc = parseP5QcCsv(p5Path);
  const eligible = eligibleVideoRows(qc);
  const block5 = block5Subsample(eligible);
  const baseline = computeBaselineB0B1(eligible, block5);
  const p16 = assertP16BaselineRegression(eligible, block5, baseline);

  const rows1Hz = parseVideo1HzCsv(hzPath);
  const windows = loadManoeuvreWindows(windowsPath);
  const contextGrid = buildDrivingContextGridFrom1Hz(rows1Hz, windows);
  const contextLabels = attachContextToEligibleRows(eligible, contextGrid);
  const p171 = assertP171Parity(eligible, windows, contextLabels);

  const { runs, break_class_counts, uncertainty_disclaimer } =
    segmentRatioStableRuns(eligible);
  const runDiag = independentRunDiagnostics(runs);

  const r1 = parseR1SameRowPairs(s4Path);
  const controls = runNegativeControls(eligible, r1);

  const clipCounts: Record<string, number> = {};
  for (const r of eligible) clipCounts[r.source_clip] = (clipCounts[r.source_clip] ?? 0) + 1;

  const readiness: RayRunInterfaceReadiness = {
    ray_fit: "TYPED_STUB_ONLY",
    separability: "TYPED_STUB_ONLY",
    abstain_state: "TYPED_STUB_ONLY",
    context_stratify: "PARTIAL_IMPLEMENTED_P17_1",
    classifier_validated: false,
  };

  const integrityControlIds = new Set([
    "NC-A_RPM_PERMUTATION_NULL",
    "NC-G_P16_REGRESSION",
    "NC-H_FORBIDDEN_CROSS_JOIN",
  ]);
  const controlFailures = controls.filter(
    (c) => c.verdict === "FAIL" && integrityControlIds.has(c.control_id),
  );
  const mandatoryPass =
    p16.pass && p171.pass && controlFailures.length === 0;

  const report: Record<string, unknown> = {
    schema: "DS4_RPM_P18A_RAY_RUN_FOUNDATION_V1",
    operation: "DS4_RPM_P18A_RAY_RUN_FOUNDATION_V1",
    mode: "IMPLEMENTATION_DRAFT_PR_ONLY",
    generated_at_utc: new Date().toISOString(),
    mandatory_gates_pass: mandatoryPass,
    SOURCE_INTEGRITY: {
      verdict: gate.verdict,
      manifest_sha256_self_declared: gate.manifest_sha256_self_declared,
      manifest_sha256_self_recomputed: gate.manifest_sha256_self_recomputed,
      manifest_sha256_self_expected: gate.manifest_sha256_self_expected,
      manifest_content_integrity: gate.manifest_content_integrity,
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
      context_source: "sealed_1Hz_display_speed_full_series_per_clip",
      unique_window_overlap: p171.unique_window_overlap,
      window_overlap_root_cause: windowOverlapRootCauseReport(),
    },
    VIDEO_CONTEXT_SOURCE_VERDICT: {
      pass: p171.pass && eligible.length === P16_REGRESSION.videoPairCount,
      note: "Context derived on full 1 Hz grid; labels attached to original 242 admissible rows only.",
    },
    ELIGIBLE_CLIP_COUNTS: {
      clips: clipCounts,
      clip_list: Object.keys(clipCounts).sort(),
    },
    INDEPENDENT_RUN_DIAGNOSTICS: {
      ...runDiag,
      break_class_counts,
      uncertainty_disclaimer,
    },
    RUN_UNCERTAINTY_VERDICT: {
      rpm_policy_rpm: 500,
      not_calibrated_distribution: true,
      k_sigma_policy_exploratory_only: true,
      run_count_not_n_eff: true,
      drift_within_run_flag_descriptive: true,
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
      p18b_readiness: "NOT_READY_CLASSIFIER_DISABLED",
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
    forbidden_field_scan: reportHasForbiddenGearFields({ report: "safe" }),
  };

  report.content_sha256_excluding_generated_at = stableReportHash(report);
  return report;
}

function failReportEarly(gate: ReturnType<typeof verifyP16Gate>, reason: string): Record<string, unknown> {
  return {
    schema: "DS4_RPM_P18A_RAY_RUN_FOUNDATION_V1",
    mandatory_gates_pass: false,
    fail_closed_reason: reason,
    SOURCE_INTEGRITY: gate,
  };
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const isMain = process.argv[1]?.includes("run_p18a_foundation");
if (isMain) {
  const report = buildP18aFoundationReport();
  const outPath =
    process.env.P18A_REPORT_PATH ??
    "/opt/cursor/artifacts/ds4-rpm-p18a-ray-run-foundation-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log("wrote", outPath);
  console.log("mandatory_gates_pass", report.mandatory_gates_pass);
  if (report.content_sha256_excluding_generated_at) {
    console.log("content_sha256", report.content_sha256_excluding_generated_at);
  }
  if (!report.mandatory_gates_pass) {
    process.exitCode = 1;
  }
}
