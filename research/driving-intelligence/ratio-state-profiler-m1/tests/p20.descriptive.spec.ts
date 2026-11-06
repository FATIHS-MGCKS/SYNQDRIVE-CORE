import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { P16_REGRESSION, P17_1_CONTEXT } from "../src/constants.js";
import { stableReportHash } from "../src/hash.js";
import { resolvePackageRoot, resolveRepoRoot } from "../src/pin/p16_gate.js";
import { buildP20DescriptiveReport } from "../src/run_p20_descriptive.js";
import { numericDistribution } from "../src/compute/descriptive_stats.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(join(here, ".."));
const pkgRoot = resolvePackageRoot(repoRoot);

describe("P20 M1 descriptive report (TIG22)", () => {
  it("real sealed report: counts, median, P17 overlap, deterministic hash", () => {
    const a = buildP20DescriptiveReport();
    const b = buildP20DescriptiveReport();
    assert.equal(a.mandatory_gates_pass, true);
    assert.equal(stableReportHash(a as Record<string, unknown>), stableReportHash(b as Record<string, unknown>));
    const base = a.P16_COUNTS_AND_BASELINE as Record<string, unknown>;
    assert.equal(base.video_eligible_pairs_n, P16_REGRESSION.videoPairCount);
    assert.equal(base.block5_subsample_n, P16_REGRESSION.block5Count);
    assert.equal(base.global_ratio_median, P16_REGRESSION.ratioMedianVMin20);
    const r1 = a.R1_SAME_ROW as { n_pairs: number };
    assert.equal(r1.n_pairs, P16_REGRESSION.r1SameRowVMin20);
    const win = a.MANOEUVRE_WINDOWS as {
      p17_1_overlap: Record<string, number>;
      all_nine_windows: unknown[];
    };
    assert.equal(win.all_nine_windows.length, 9);
    assert.equal(
      win.p17_1_overlap.unique_eligible_keys_inside_tc80_tc84_windows,
      P17_1_CONTEXT.windowEligibleOverlapUniqueCount,
    );
    assert.equal(
      win.p17_1_overlap.sum_of_per_window_eligible_counts_tc80_tc84,
      P17_1_CONTEXT.windowEligibleOverlapSumPerWindowP171,
    );
    const gov = a.governance as Record<string, Record<string, unknown>>;
    assert.equal(gov.source_integrity.verdict, "PASS");
    assert.equal(gov.descriptive_usability.verdict, "USABLE");
    const rep = gov.statistical_replication as {
      verdict: string;
      detail: string[];
      controls: Record<string, string>;
    };
    assert.equal(rep.verdict, "SCIENTIFIC_NEGATIVE");
    assert.equal(rep.controls.NC_A, "SCIENTIFIC_NEGATIVE");
    assert.equal(rep.controls.NC_E, "SCIENTIFIC_NEGATIVE");
    assert.ok(rep.detail.some((d) => d.includes("rpm permutation")), "NC-A detail should describe permutation control");
    assert.ok(
      rep.detail.some((d) => d.includes("Temporal halves") || d.includes("major modes")),
      "NC-E detail should describe temporal split",
    );
    assert.equal(gov.classification_eligibility.verdict, "NOT_ELIGIBLE");
    assert.equal(
      (gov.classification_eligibility as { ray_run_p18b: string }).ray_run_p18b,
      "NO_GO",
    );
    const manifest = JSON.parse(
      readFileSync(join(pkgRoot, "fixtures/p20-evidence-manifest.json"), "utf8"),
    ) as { p20_report_content_sha256_excluding_generated_at: string };
    assert.equal(a.content_sha256_excluding_generated_at, manifest.p20_report_content_sha256_excluding_generated_at);
    assert.deepEqual(a.forbidden_field_scan, []);

    const r1Bands = (a.R1_SAME_ROW as { rpm_by_speed_band: Array<Record<string, unknown>> }).rpm_by_speed_band;
    for (const b of r1Bands) {
      const sq = b.source_quality as { rpm_quantization_step_rpm?: string; reading_uncertainty_video_policy_rpm?: string };
      assert.equal(sq.rpm_quantization_step_rpm, "UNKNOWN");
      assert.equal(sq.reading_uncertainty_video_policy_rpm, "NOT_APPLICABLE");
    }
    const vidBand0 = (a.RPM_BY_SPEED_BAND as { bands: Array<Record<string, unknown>> }).bands[0];
    assert.equal((vidBand0.source_quality as { evidence_stream?: string }).evidence_stream, "VIDEO_P5_POSITIVE_VISUAL_CANDIDATE");
    assert.equal(
      (vidBand0.statistical_presentation as { p05_p95?: string }).p05_p95,
      "EXPLORATORY_NOT_CALIBRATED_PRECISION",
    );
  });

  it("FAIL_CLOSED on mutated P5 sealed copy (temp path)", () => {
    const dir = mkdtempSync(join(tmpdir(), "p20-mut-"));
    try {
      const p5 = join(pkgRoot, "fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv");
      const copy = join(dir, "p5.csv");
      copyFileSync(p5, copy);
      appendFileSync(copy, "\n");
      const r = buildP20DescriptiveReport({ sealedPathOverrides: { p5_optical_qc_overlay: copy } });
      assert.equal(r.mandatory_gates_pass, false);
      assert.equal(r.fail_closed_reason, "SOURCE_INTEGRITY_FAIL_CLOSED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("numericDistribution NOT_AVAILABLE for empty and n<5", () => {
    const e = numericDistribution([]);
    assert.equal(e.status, "NOT_AVAILABLE");
    assert.equal(e.reason_code, "EMPTY_BAND");
    const s = numericDistribution([1, 2, 3, 4]);
    assert.equal(s.status, "NOT_AVAILABLE");
    assert.equal(s.reason_code, "N_LT_5");
    assert.equal(numericDistribution([1, 2, 3, 4, 5]).status, "AVAILABLE");
  });
});
