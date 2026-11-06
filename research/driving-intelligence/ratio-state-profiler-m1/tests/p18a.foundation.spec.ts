import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  P16_MANIFEST_SHA256_SELF,
  P16_REGRESSION,
  P16_SEALED_ARTIFACTS,
  P17_1_CONTEXT,
} from "../src/constants.js";
import {
  verifyP16Gate,
  resolveRepoRoot,
  resolvePackageRoot,
  loadManifestFromPath,
  recomputeManifestSelfHashFromFile,
} from "../src/pin/p16_gate.js";
import {
  eligibleVideoRows,
  block5Subsample,
  parseP5QcCsv,
  parseR1SameRowPairs,
} from "../src/loaders/video_cohort.js";
import { parseVideo1HzCsv } from "../src/loaders/video_1hz.js";
import {
  assertP16BaselineRegression,
  computeBaselineB0B1,
  reportHasForbiddenGearFields,
} from "../src/compute/baseline_b0_b1.js";
import {
  assertP171Parity,
  attachContextToEligibleRows,
  buildDrivingContextGridFrom1Hz,
  loadManoeuvreWindows,
  windowOverlapRootCauseReport,
} from "../src/compute/driving_context.js";
import { runNegativeControls } from "../src/controls/negative_controls.js";
import { buildP18aFoundationReport } from "../src/run_p18a_foundation.js";
import { stableReportHash } from "../src/hash.js";
import { rayFitFromEligibleRows } from "../src/interfaces/ray_fit.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(join(here, ".."));
const pkgRoot = resolvePackageRoot(repoRoot);

function paths() {
  const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
  const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
  const s4 = join(
    repoRoot,
    P16_SEALED_ARTIFACTS.find((a) => a.role === "sealed_s4_r1_obd")!.repo_relative,
  );
  const hz = join(
    repoRoot,
    P16_SEALED_ARTIFACTS.find((a) => a.role === "video_1hz_reference")!.repo_relative,
  );
  const wins = join(
    repoRoot,
    P16_SEALED_ARTIFACTS.find((a) => a.role === "analysis_windows_nine")!.repo_relative,
  );
  return { manifestPath, p5, s4, hz, wins };
}

describe("P18A RAY-RUN foundation", () => {
  it("recomputes P16 manifest content digest (not declared field alone)", () => {
    const { manifestPath } = paths();
    const recomputed = recomputeManifestSelfHashFromFile(manifestPath);
    assert.equal(recomputed, P16_MANIFEST_SHA256_SELF);
    const manifest = loadManifestFromPath(manifestPath);
    assert.equal(manifest.manifest_sha256_self, P16_MANIFEST_SHA256_SELF);
  });

  it("P16 gate passes with all mandatory sealed roles including nine windows", () => {
    const { manifestPath } = paths();
    const gate = verifyP16Gate(repoRoot, manifestPath, loadManifestFromPath(manifestPath));
    assert.equal(gate.verdict, "PASS", gate.errors.join("; "));
    assert.equal(gate.manifest_content_integrity, "MATCH");
    const roles = new Set(gate.sealed_inputs.map((s) => s.role));
    assert.ok(roles.has("analysis_windows_nine"));
  });

  it("P16 parity: 242 / 49 / 442 / mode counts", () => {
    const { p5, s4 } = paths();
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const block5 = block5Subsample(eligible);
    const baseline = computeBaselineB0B1(eligible, block5);
    const reg = assertP16BaselineRegression(eligible, block5, baseline);
    assert.ok(reg.pass, reg.details.join("; "));
    assert.equal(parseR1SameRowPairs(s4).length, P16_REGRESSION.r1SameRowVMin20);
  });

  it("driving context from full 1 Hz series; 50 unique window overlap", () => {
    const { p5, hz, wins } = paths();
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const grid = buildDrivingContextGridFrom1Hz(parseVideo1HzCsv(hz), loadManoeuvreWindows(wins));
    const labels = attachContextToEligibleRows(eligible, grid);
    const parity = assertP171Parity(eligible, loadManoeuvreWindows(wins), labels);
    assert.ok(parity.pass, parity.details.join("; "));
    assert.equal(parity.unique_window_overlap, P17_1_CONTEXT.windowEligibleOverlapUniqueCount);
    const root = windowOverlapRootCauseReport();
    assert.equal(root.double_counted_key, "TC_00084.MOV|138");
  });

  it("negative controls: integrity controls PASS; NC-D/NC-E may be SCIENTIFIC_NEGATIVE", () => {
    const { p5, s4 } = paths();
    const eligible = eligibleVideoRows(parseP5QcCsv(p5));
    const controls = runNegativeControls(eligible, parseR1SameRowPairs(s4));
    const ncD = controls.find((c) => c.control_id === "NC-D_LEAVE_ONE_ELIGIBLE_CLIP_OUT");
    const ncE = controls.find((c) => c.control_id === "NC-E_SPLIT_HALF_TEMPORAL_STABILITY");
    assert.ok(ncD && ncE);
    assert.notEqual(ncD.verdict, "FAIL");
    assert.notEqual(ncE.verdict, "FAIL");
    const hardFails = controls.filter(
      (c) =>
        c.verdict === "FAIL" &&
        ["NC-A_RPM_PERMUTATION_NULL", "NC-G_P16_REGRESSION", "NC-H_FORBIDDEN_CROSS_JOIN"].includes(
          c.control_id,
        ),
    );
    assert.equal(hardFails.length, 0);
  });

  it("foundation report mandatory gates pass; deterministic hash stable", () => {
    const a = buildP18aFoundationReport();
    const b = buildP18aFoundationReport();
    assert.equal(a.mandatory_gates_pass, true);
    assert.equal(a.SOURCE_INTEGRITY && (a.SOURCE_INTEGRITY as { verdict: string }).verdict, "PASS");
    assert.equal(stableReportHash(a as Record<string, unknown>), stableReportHash(b as Record<string, unknown>));
    assert.deepEqual(reportHasForbiddenGearFields(a), []);
    assert.equal(rayFitFromEligibleRows([]).status, "NOT_ENABLED_P18A");
  });
});
