#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  M1_DEFAULTS,
  P16_REGRESSION,
  P16_SEALED_ARTIFACTS,
  P17_1_CONTEXT,
  P17_1_WINDOW_OVERLAP,
} from "./constants.js";
import { stableReportHash } from "./hash.js";
import {
  loadManifestFromPath,
  resolvePackageRoot,
  resolveRepoRoot,
  verifyP16Gate,
  type P16GateOptions,
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
  mergeOverlappingPeaks,
  ratioValues,
  reportHasForbiddenGearFields,
} from "./compute/baseline_b0_b1.js";
import {
  attachContextToEligibleRows,
  buildDrivingContextGridFrom1Hz,
  loadManoeuvreWindows,
  loadManoeuvreWindowsAllNine,
  rowKey,
  type ManoeuvreWindow,
} from "./compute/driving_context.js";
import { runNegativeControls } from "./controls/negative_controls.js";
import {
  assertP16RegressionDescriptive,
  median,
  rpmBySpeedBandR1,
  rpmBySpeedBandVideo,
  VIDEO_SPEED_BANDS,
  ratioBySpeedBandR1,
  rpmDistributionVideo,
} from "./compute/descriptive_stats.js";
import { stratifyByDrivingContext } from "./interfaces/context_stratify.js";
import type { DrivingContextLabel, NegativeControlResult, VideoEligibleRow } from "./types.js";

const SCHEMA = "DS4_RPM_M1_DESCRIPTIVE_REPORT_V1";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolveRepoRoot(here);
const pkgRoot = resolvePackageRoot(repoRoot);

function sealedPath(role: string): string {
  const art = P16_SEALED_ARTIFACTS.find((a) => a.role === role);
  if (!art) throw new Error(`missing pinned role ${role}`);
  return join(repoRoot, art.repo_relative);
}

function failClosed(reason: string, detail: unknown): Record<string, unknown> {
  return {
    schema: SCHEMA,
    report_kind: "DESCRIPTIVE_ONLY",
    mandatory_gates_pass: false,
    fail_closed_reason: reason,
    detail,
  };
}

function eligibleInWindow(eligible: VideoEligibleRow[], w: ManoeuvreWindow): VideoEligibleRow[] {
  return eligible.filter(
    (r) =>
      r.source_clip === w.source_clip &&
      r.video_second >= w.start_video_s &&
      r.video_second <= w.end_video_s,
  );
}

function countSumPerWindowP171(eligible: VideoEligibleRow[], windows: ManoeuvreWindow[]): number {
  let s = 0;
  for (const w of windows) s += eligibleInWindow(eligible, w).length;
  return s;
}

function statisticalReplicationFromNcAE(
  ncA: NegativeControlResult | undefined,
  ncE: NegativeControlResult | undefined,
): { verdict: string; detail: string[]; controls: Record<string, string> } {
  const a = ncA?.verdict ?? "UNKNOWN";
  const e = ncE?.verdict ?? "UNKNOWN";
  const controls = { NC_A: a, NC_E: e };
  const isNeg = (v: string) => v === "SCIENTIFIC_NEGATIVE";
  if (a === "UNKNOWN" || e === "UNKNOWN") {
    return {
      verdict: "UNKNOWN",
      detail: ["NC-A or NC-E verdict missing; do not assert SCIENTIFIC_NEGATIVE for replication governance."],
      controls,
    };
  }
  if (isNeg(a) && isNeg(e)) {
    return {
      verdict: "SCIENTIFIC_NEGATIVE",
      detail: [String(ncA?.detail ?? ""), String(ncE?.detail ?? "")].filter((x) => x.length > 0),
      controls,
    };
  }
  if (!isNeg(a) && !isNeg(e)) {
    return {
      verdict: "REPLICATION_NOT_NEGATED_BY_NC_A_NC_E",
      detail: [
        "Both NC-A and NC-E passed their registered criteria; statistical_replication is not summarized as SCIENTIFIC_NEGATIVE from these two controls.",
      ],
      controls,
    };
  }
  return {
    verdict: "MIXED_NC_A_NC_E",
    detail: [
      `NC-A verdict ${a}; NC-E verdict ${e}. Read per-control detail in LIMITATIONS; do not infer a single blanket SCIENTIFIC_NEGATIVE.`,
      String(ncA?.detail ?? ""),
      String(ncE?.detail ?? ""),
    ].filter((x) => x.length > 0),
    controls,
  };
}

function drivingContextProfiles(
  eligible: VideoEligibleRow[],
  labels: Map<string, DrivingContextLabel>,
): Array<Record<string, unknown>> {
  const base = stratifyByDrivingContext({
    eligible,
    labels,
    min_n: P17_1_CONTEXT.minNPerStratum,
  });
  return base.strata.map((s) => {
    const rows = eligible.filter(
      (r) => (labels.get(rowKey(r.source_clip, r.video_second)) ?? "UNKNOWN") === s.context,
    );
    const rpmBands = VIDEO_SPEED_BANDS.map((spec) => {
      const inBand = rows.filter((r) => {
        const ok = r.speed_kmh > spec.v_kmh_min_exclusive;
        const hi = spec.v_kmh_max_inclusive;
        if (!ok) return false;
        if (hi != null && r.speed_kmh > hi) return false;
        return true;
      });
      return {
        band_id: spec.band_id,
        ...rpmDistributionVideo(inBand),
      };
    });
    return {
      label: s.context,
      n_seconds: s.n,
      context_stratum_status: s.not_available ? "NOT_AVAILABLE" : "DESCRIPTIVE",
      ratio_peaks_status: s.not_available ? "NOT_AVAILABLE" : "AVAILABLE",
      ratio_peaks: s.not_available ? null : s.peaks,
      rpm_by_speed_band_within_stratum: rpmBands,
    };
  });
}

function germanMarkdown(report: Record<string, unknown>): string {
  const g = report.governance as Record<string, Record<string, unknown>>;
  const p16 = report.P16_COUNTS_AND_BASELINE as Record<string, unknown>;
  const rpm = report.RPM_BY_SPEED_BAND as {
    bands: Array<Record<string, unknown>>;
  };
  const ctx = report.DRIVING_CONTEXT_PROFILES as {
    profiles: Array<Record<string, unknown>>;
  };
  const mw = report.MANOEUVRE_WINDOWS as {
    p17_1_overlap: {
      unique_eligible_keys_inside_tc80_tc84_windows: number;
      sum_of_per_window_eligible_counts_tc80_tc84: number;
      double_count_explanation: typeof P17_1_WINDOW_OVERLAP;
    };
    all_nine_windows: Array<Record<string, unknown>>;
  };
  const r1 = report.R1_SAME_ROW as Record<string, unknown>;
  const lim = report.LIMITATIONS as Record<string, unknown>;
  const ncSummary = (lim.negative_controls_summary as Record<string, string>) ?? {};

  const rpmLines = rpm.bands.map((b) => {
    const id = b.band_id;
    if (b.status === "AVAILABLE") {
      return `- **${id}**: n=${b.n_observations}, Median=${b.rpm_median} min⁻¹ (beobachtet); p05/p95=${b.rpm_p05}/${b.rpm_p95} (explorativ, keine Kalibrierung); min=${b.rpm_min}, max=${b.rpm_max}`;
    }
    return `- **${id}**: ${String(b.status)} (${String((b as { reason_code?: string }).reason_code)}) n=${b.n_observations}`;
  });

  const ctxLines = ctx.profiles.map((p) => {
    const label = p.label;
    const n = p.n_seconds;
    const st = p.context_stratum_status;
    if (st === "NOT_AVAILABLE") return `- **${String(label)}**: n=${n}, keine Histogramm‑Synthese (Mindest‑n nicht erreicht)`;
    const peaks = p.ratio_peaks as Array<{ center_rpm_per_kmh: number; count: number }> | null;
    const peakTxt =
      peaks && peaks.length
        ? peaks
            .slice(0, 4)
            .map((x) => `${x.center_rpm_per_kmh} (${x.count})`)
            .join(", ")
        : "—";
    return `- **${String(label)}**: n=${n}, anonyme Verhältnis‑Peaks (Top): ${peakTxt}`;
  });

  const winLines = mw.all_nine_windows.map((w) => {
    const id = w.window_id;
    const clip = w.source_clip;
    const n = w.eligible_seconds_v_gt_20;
    const st = w.status;
    const rs = (w.reason as string | undefined) ?? "";
    if (st === "DESCRIPTIVE" && w.rpm_distribution && typeof w.rpm_distribution === "object") {
      const d = w.rpm_distribution as {
        rpm_median?: number;
        median?: number;
        n_observations: number;
        rpm_p05?: number;
        rpm_p95?: number;
      };
      const med = d.rpm_median ?? d.median;
      const tails =
        d.rpm_p05 != null && d.rpm_p95 != null
          ? `, p05/p95=${d.rpm_p05}/${d.rpm_p95} (explorativ)`
          : "";
      return `- **${String(id)}** ${String(clip)}: n=${n}, RPM Median=${med} min⁻¹ (beobachtet)${tails}`;
    }
    return `- **${String(id)}** ${String(clip)}: n=${n}, ${String(st)}${rs ? ` (${rs})` : ""}`;
  });

  const expl = mw.p17_1_overlap.double_count_explanation;

  return [
    "# TIG22 — M1 deskriptiver Forschungsbericht (Video + getrennt R1)",
    "",
    "**Geltungsbereich:** Nur gesiegelte historische Nachweise. Kein Gangnachweis, keine Schalterkennung, kein reale Lastpfad, kein Kraftstoff‑ oder Fahrer‑Score.",
    "",
    "## Governance (vier unabhängige Felder)",
    "",
    `- **source_integrity:** ${g.source_integrity.verdict}`,
    `- **descriptive_usability:** ${g.descriptive_usability.verdict}`,
    `- **statistical_replication:** ${g.statistical_replication.verdict} — NC‑A = ${(g.statistical_replication.controls as Record<string, string>).NC_A}, NC‑E = ${(g.statistical_replication.controls as Record<string, string>).NC_E}`,
    `- **classification_eligibility:** ${g.classification_eligibility.verdict} — RAY‑RUN (P18B) = ${(g.classification_eligibility as { ray_run_p18b: string }).ray_run_p18b}`,
    "",
    "## Kohorte und P16‑Referenz",
    "",
    `- Video‑Paare (Anzeige‑Geschwindigkeit >20 km/h): **${p16.video_eligible_pairs_n}**`,
    `- Block‑5‑Teilstichprobe: **${p16.block5_subsample_n}**`,
    `- R1 gleiche Zeile (OBD‑Geschwindigkeit >20 km/h): **${p16.r1_same_row_pairs_n}** — **kein** Join zu Video oder DS4`,
    `- globales Verhältnis‑Median (Video): **${p16.global_ratio_median}** min⁻¹/(km/h)`,
    "",
    "## Drehzahlen nach Geschwindigkeitsband (Video, quantisiert 250 min⁻¹)",
    "",
    ...rpmLines,
    "",
    "## Fahrkontext (nur Video, Display‑Trend P17.1)",
    "",
    ...ctxLines,
    "",
    "## Manöverfenster (alle 9 Zeilen der CSV, hash‑gesiegelt)",
    "",
    `- **Eindeutige Eligible‑Sekunden** in den TC_00080/84‑Fenstern: **${mw.p17_1_overlap.unique_eligible_keys_inside_tc80_tc84_windows}**`,
    `- **Summe der Fensterzählungen** (Zählung mit Mehrfach‑Hits): **${mw.p17_1_overlap.sum_of_per_window_eligible_counts_tc80_tc84}**`,
    `- **Doppelt gezählter Rand:** \`${expl.double_counted_key}\` in ${expl.double_counted_windows.join(" & ")}`,
    "",
    ...winLines,
    "",
    "## R1 gleiche Zeile (getrennte Evidenz)",
    "",
    `- n=${r1.n_pairs}, ${String(r1.pairing_authority)}`,
    "- RPM‑ und Verhältnis‑Bänder sind **getrennt** von den Video‑Spalten berechnet.",
    "- OBD‑Auflösung/Abtastgenauigkeit der RPM‑Werte: **UNKNOWN** (keine Video‑Optik‑±500‑ und keine 250‑min⁻¹‑Quantisierung).",
    "",
    "## Wissenschaftliche Grenzen",
    "",
    "- Verhältnis‑Peaks sind **anonyme Modus‑Kandidaten**, keine Gänge.",
    `- Hohe „Coverage" heißt nicht kausale Validierung; **NC‑A** = ${ncSummary["NC-A_RPM_PERMUTATION_NULL"] ?? "?"}, **NC‑E** = ${ncSummary["NC-E_SPLIT_HALF_TEMPORAL_STABILITY"] ?? "?"} (siehe \`governance.statistical_replication\`).`,
    "",
    `Negative‑Control‑Stichworte: ${JSON.stringify((lim.negative_controls_summary as Record<string, string>) ?? {})}`,
    "",
  ].join("\n");
}

export function buildP20DescriptiveReport(options?: P16GateOptions): Record<string, unknown> {
  const manifestPath = join(pkgRoot, "fixtures/p16-ratio-state-evidence-pin-manifest.json");
  const manifest = loadManifestFromPath(manifestPath);
  const gate = verifyP16Gate(repoRoot, manifestPath, manifest, options);

  if (gate.verdict !== "PASS") return failClosed("SOURCE_INTEGRITY_FAIL_CLOSED", gate);

  const p5Path = sealedPath("p5_optical_qc_overlay");
  const s4Path = sealedPath("sealed_s4_r1_obd");
  const hzPath = sealedPath("video_1hz_reference");
  const windowsPath = sealedPath("analysis_windows_nine");

  const qc = parseP5QcCsv(p5Path);
  const eligible = eligibleVideoRows(qc);
  const block5 = block5Subsample(eligible);
  const baseline = computeBaselineB0B1(eligible, block5);
  const p16Parity = assertP16BaselineRegression(eligible, block5, baseline);
  const medVideo = median(ratioValues(eligible));
  const medCheck = assertP16RegressionDescriptive(eligible, block5, medVideo);

  const rows1Hz = parseVideo1HzCsv(hzPath);
  const windowsP16 = loadManoeuvreWindows(windowsPath);
  const windowsAll = loadManoeuvreWindowsAllNine(windowsPath);
  const contextGrid = buildDrivingContextGridFrom1Hz(rows1Hz, windowsP16);
  const contextLabels = attachContextToEligibleRows(eligible, contextGrid);
  const r1 = parseR1SameRowPairs(s4Path);
  const controls = runNegativeControls(eligible, r1);

  const uniqueOverlap = countEligibleInsideWindowsDedup(eligible, windowsP16);
  const sumPerWindow = countSumPerWindowP171(eligible, windowsP16);

  if (eligible.length !== P16_REGRESSION.videoPairCount || !p16Parity.pass) {
    return failClosed("P16_BASELINE_MISMATCH", { p16Parity, medCheck, eligible_n: eligible.length });
  }
  if (block5.length !== P16_REGRESSION.block5Count) {
    return failClosed("P16_BLOCK5_MISMATCH", { n: block5.length });
  }
  if (r1.length !== P16_REGRESSION.r1SameRowVMin20) {
    return failClosed("P16_R1_COUNT_MISMATCH", { n: r1.length });
  }
  const p171Unique = uniqueOverlap === P17_1_CONTEXT.windowEligibleOverlapUniqueCount;
  const p171LabelsOk = eligible.every((r) =>
    contextLabels.has(rowKey(r.source_clip, r.video_second)),
  );
  if (!(p171Unique && p171LabelsOk)) {
    return failClosed("P17_1_PARITY_FAIL", { p171Unique, p171LabelsOk, uniqueOverlap });
  }
  if (sumPerWindow !== P17_1_CONTEXT.windowEligibleOverlapSumPerWindowP171) {
    return failClosed("P17_1_WINDOW_SUM_MISMATCH", { sumPerWindow });
  }

  const ncA = controls.find((c) => c.control_id === "NC-A_RPM_PERMUTATION_NULL");
  const ncE = controls.find((c) => c.control_id === "NC-E_SPLIT_HALF_TEMPORAL_STABILITY");

  const manoeuvreNine = windowsAll.map((w) => {
    const rows = eligibleInWindow(eligible, w);
    const inCohort = (P16_REGRESSION.eligibleClips as readonly string[]).includes(w.source_clip);
    let status: "DESCRIPTIVE" | "NOT_AVAILABLE";
    let reason: string | undefined;
    if (!inCohort) {
      status = "NOT_AVAILABLE";
      reason = "OUTSIDE_P16_VIDEO_COHORT";
    } else if (rows.length === 0) {
      status = "NOT_AVAILABLE";
      reason = "EMPTY_WINDOW_UNDER_P16_FILTERS";
    } else if (rows.length < 5) {
      status = "NOT_AVAILABLE";
      reason = "N_LT_5_FOR_DISTRIBUTION";
    } else {
      status = "DESCRIPTIVE";
    }
    const rpm = status === "DESCRIPTIVE" ? rpmDistributionVideo(rows) : null;
    return {
      window_id: w.id,
      source_clip: w.source_clip,
      type: w.type,
      start_video_s: w.start_video_s,
      end_video_s: w.end_video_s,
      eligible_seconds_v_gt_20: rows.length,
      status,
      reason,
      rpm_distribution: rpm,
    };
  });

  const replicationGov = statisticalReplicationFromNcAE(ncA, ncE);

  const report: Record<string, unknown> = {
    schema: SCHEMA,
    report_kind: "DESCRIPTIVE_ONLY",
    operation: "DS4_RPM_P20_M1_REAL_DATA_DESCRIPTIVE_REPORT",
    mode: "IMPLEMENTATION_DRAFT_PR_ONLY",
    generated_at_utc: new Date().toISOString(),
    mandatory_gates_pass: true,
    governance: {
      source_integrity: { verdict: "PASS", detail: ["P16 sealed SHA-256 checks passed"] },
      descriptive_usability: { verdict: "USABLE", detail: ["Descriptive sections emitted under explicit caveats"] },
      statistical_replication: {
        verdict: replicationGov.verdict,
        detail: replicationGov.detail,
        controls: replicationGov.controls,
      },
      classification_eligibility: {
        verdict: "NOT_ELIGIBLE",
        ray_run_p18b: "NO_GO",
        detail: [
          "RAY-RUN V1 experimental evaluation did not outperform B0/B1 under pre-registered acceptance criteria; classifier not activated.",
        ],
      },
    },
    SOURCE_INTEGRITY: {
      verdict: gate.verdict,
      manifest_sha256_self_recomputed: gate.manifest_sha256_self_recomputed,
      sealed_inputs: gate.sealed_inputs.map((s) => ({ role: s.role, match: s.match })),
    },
    P16_COUNTS_AND_BASELINE: {
      video_eligible_pairs_n: eligible.length,
      block5_subsample_n: block5.length,
      r1_same_row_pairs_n: r1.length,
      global_ratio_median: Math.round(medVideo * 100) / 100,
      p16_regression: {
        pass: p16Parity.pass && medCheck.pass,
        video_block5_details: p16Parity.details,
        median_check_details: medCheck.details,
      },
      b0_histogram: {
        label: "B0_HISTOGRAM_242_ELIGIBLE",
        bin_width_rpm_per_kmh: M1_DEFAULTS.histogramBinWidthRpmPerKmh,
        peaks: mergeOverlappingPeaks([...baseline.b0_histogram_peaks]),
        fable_band_counts: fableBandCounts(ratioValues(eligible)),
      },
      b1_block5: {
        label: "B1_BLOCK5_SUBSAMPLE",
        stride_seconds: M1_DEFAULTS.blockSubsampleStrideSeconds,
        peaks: mergeOverlappingPeaks([...baseline.block5_peaks]),
      },
    },
    RPM_BY_SPEED_BAND: {
      cohort: "VIDEO_P16_ELIGIBLE",
      bands: rpmBySpeedBandVideo(eligible),
    },
    DRIVING_CONTEXT_PROFILES: {
      contract_id: P17_1_CONTEXT.contractId,
      context_source:
        "sealed_1Hz_display_speed_full_series_per_clip_labels_on_242_eligible_seconds",
      profiles: drivingContextProfiles(eligible, contextLabels),
    },
    MANOEUVRE_WINDOWS: {
      csv_row_count_total: windowsAll.length,
      p17_1_overlap: {
        unique_eligible_keys_inside_tc80_tc84_windows: uniqueOverlap,
        sum_of_per_window_eligible_counts_tc80_tc84: sumPerWindow,
        double_count_explanation: P17_1_WINDOW_OVERLAP,
      },
      all_nine_windows: manoeuvreNine,
    },
    R1_SAME_ROW: {
      pairing_authority: "SAME_EVIDENCE_ROW_INTERVAL_ONLY",
      forbidden_joins: ["VIDEO_TEMPORAL", "DS4_C4", "DS4_L3"],
      n_pairs: r1.length,
      rpm_by_speed_band: rpmBySpeedBandR1(r1),
      ratio_by_speed_band: ratioBySpeedBandR1(r1),
    },
    LIMITATIONS: {
      descriptive_vs_inference:
        "This report is sealed-input descriptive statistics only. It does not validate mechanical regimes, gears, shifts, or causal behavior.",
      negative_controls_summary: Object.fromEntries(controls.map((c) => [c.control_id, c.verdict])),
      nc_a: ncA,
      nc_e: ncE,
      p18b_ray_run: "NO_GO_NOT_ACTIVATED",
    },
    PRODUCT_FEASIBILITY: {
      assessment: "Research-only descriptive dashboard possible; no automated gear/shift product path without new validation and broader cohorts.",
    },
    forbidden_field_scan: [],
  };

  report.forbidden_field_scan = reportHasForbiddenGearFields(report);
  report.content_sha256_excluding_generated_at = stableReportHash(report);
  report.german_markdown = germanMarkdown(report);
  return report;
}

function countEligibleInsideWindowsDedup(
  eligible: VideoEligibleRow[],
  windows: ManoeuvreWindow[],
): number {
  const keys = new Set<string>();
  for (const r of eligible) {
    for (const w of windows) {
      if (r.source_clip !== w.source_clip) continue;
      if (r.video_second >= w.start_video_s && r.video_second <= w.end_video_s) {
        keys.add(rowKey(r.source_clip, r.video_second));
        break;
      }
    }
  }
  return keys.size;
}

const isMain = process.argv[1]?.includes("run_p20_descriptive");
if (isMain) {
  const report = buildP20DescriptiveReport();
  const jsonPath =
    process.env.P20_REPORT_JSON_PATH ??
    "/opt/cursor/artifacts/ds4-rpm-p20-m1-descriptive-report.json";
  const mdPath =
    process.env.P20_REPORT_DE_PATH ??
    "/opt/cursor/artifacts/ds4-rpm-p20-m1-descriptive-report.de.md";
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, String(report.german_markdown ?? ""));
  console.log("wrote", jsonPath);
  console.log("wrote", mdPath);
  console.log("content_sha256", report.content_sha256_excluding_generated_at);
  if (!report.mandatory_gates_pass) process.exitCode = 1;
}
