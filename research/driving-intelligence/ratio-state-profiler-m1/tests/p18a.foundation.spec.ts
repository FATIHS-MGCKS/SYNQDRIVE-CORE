import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { P16_MANIFEST_SHA256_SELF, P16_REGRESSION, P17_1_CONTEXT } from "../src/constants.js";
import { verifyP16Gate, resolveRepoRoot, resolvePackageRoot } from "../src/pin/p16_gate.js";
import {
  eligibleVideoRows,
  block5Subsample,
  parseP5QcCsv,
  parseR1SameRowPairs,
  attemptForbiddenVideoR1UtcJoin,
} from "../src/loaders/video_cohort.js";
import {
  assertP16BaselineRegression,
  computeBaselineB0B1,
  reportHasForbiddenGearFields,
} from "../src/compute/baseline_b0_b1.js";
import { segmentRatioStableRuns } from "../src/compute/segment_runs.js";
import {
  assertP171Parity,
  labelDrivingContextV1,
  loadManoeuvreWindows,
} from "../src/compute/driving_context.js";
import { runNegativeControls } from "../src/controls/negative_controls.js";
import { buildP18aFoundationReport } from "../src/run_p18a_foundation.js";
import { rayFitFromEligibleRows } from "../src/interfaces/ray_fit.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(join(here, ".."));
const pkgRoot = resolvePackageRoot(repoRoot);

describe("P18A RAY-RUN foundation", () => {
  it("verifies P16 manifest declared self-hash (5774…704e6)", () => {
    const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.manifest_sha256_self, P16_MANIFEST_SHA256_SELF);
  });

  it("P16 gate passes on sealed fixtures", () => {
    const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const gate = verifyP16Gate(repoRoot, manifestPath, manifest);
    assert.equal(gate.verdict, "PASS", gate.errors.join("; "));
  });

  it("P16 parity: 242 video pairs, 49 block-5, 442 R1 same-row", () => {
    const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
    const gate = verifyP16Gate(
      repoRoot,
      manifestPath,
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
    const p5 = gate.sealed_inputs.find((s) => s.role === "p5_optical_qc_overlay")!.resolved_path;
    const s4 = gate.sealed_inputs.find((s) => s.role === "sealed_s4_r1_obd")!.resolved_path;
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const block5 = block5Subsample(eligible);
    const baseline = computeBaselineB0B1(eligible, block5);
    const reg = assertP16BaselineRegression(eligible, block5, baseline);
    assert.ok(reg.pass, reg.details.join("; "));
    assert.equal(eligible.length, P16_REGRESSION.videoPairCount);
    assert.equal(block5.length, P16_REGRESSION.block5Count);
    assert.equal(parseR1SameRowPairs(s4).length, P16_REGRESSION.r1SameRowVMin20);
  });

  it("measures eligible clip counts and run diagnostics (not assumed n_eff)", () => {
    const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const clips = new Set(eligible.map((r) => r.source_clip));
    assert.equal(clips.size, 2);
    const { runs } = segmentRatioStableRuns(eligible);
    assert.ok(runs.length >= 1);
    assert.equal(typeof runs.length, "number");
  });

  it("P17.1 context parity: measured window overlap + labels for all eligible rows", () => {
    const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
    const windowsPath = join(
      repoRoot,
      "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_analysis_windows.csv",
    );
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const windows = loadManoeuvreWindows(windowsPath);
    const labels = labelDrivingContextV1(eligible, windows);
    const parity = assertP171Parity(eligible, windows, labels);
    assert.ok(parity.pass, parity.details.join("; "));
  });

  it("negative controls run without FAIL on P16 regression", () => {
    const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const controls = runNegativeControls(eligible);
    const p16 = controls.find((c) => c.control_id === "NC-G_P16_REGRESSION");
    assert.equal(p16?.verdict, "PASS");
  });

  it("forbidden cross-join guard is fail-closed", () => {
    const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
    const s4 = join(
      repoRoot,
      "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin",
    );
    const v = eligibleVideoRows(parseP5QcCsv(p5));
    const r1 = parseR1SameRowPairs(s4);
    const g = attemptForbiddenVideoR1UtcJoin(v, r1);
    assert.equal(g.verdict, "BLOCKED_CROSS_SOURCE");
  });

  it("report schema has no gear fields; RAY-RUN classifier not enabled", () => {
    const report = buildP18aFoundationReport();
    assert.deepEqual(reportHasForbiddenGearFields(report), []);
    const readiness = report.RAY_RUN_INTERFACE_READINESS as Record<string, unknown>;
    assert.equal(readiness.classifier_enabled, false);
    assert.equal(rayFitFromEligibleRows([]).status, "NOT_ENABLED_P18A");
  });

  it("foundation report SOURCE_INTEGRITY passes", () => {
    const report = buildP18aFoundationReport();
    const si = report.SOURCE_INTEGRITY as { verdict: string };
    assert.equal(si.verdict, "PASS");
    const ctx = report.P17_1_CONTEXT_PARITY as { pass: boolean };
    assert.equal(ctx.pass, true);
  });
});
