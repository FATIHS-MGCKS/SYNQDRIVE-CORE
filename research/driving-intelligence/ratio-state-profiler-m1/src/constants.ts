/** Research-only M1 constants — frozen P16/P17 defaults. */
export const P16_MANIFEST_SHA256_SELF =
  "5774d38fa2bb96adc89fbe04ca4f37b6ca7b730e06d0febd31bb50b7d9f704e6";

/** Mandatory sealed artifacts (hash-gated before any analysis). */
export const P16_SEALED_ARTIFACTS = [
  {
    role: "video_1hz_reference",
    repo_relative:
      "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_1Hz.csv",
    sha256: "9c8933c223e58706d1cc1ce82fe8c623e2429d3bd1f4f570e10353f9f3b9aaa2",
  },
  {
    role: "p5_optical_qc_overlay",
    repo_relative:
      "research/driving-intelligence/ratio-state-profiler-m1/fixtures/sealed/TIG22_P5_OPTICAL_QC_360ROWS.csv",
    sha256: "f4818955f497e3c3a36def76fe6d257e715b0e6610db658cfef8c93b5f4bb0b6",
  },
  {
    role: "sealed_s4_r1_obd",
    repo_relative:
      "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/snapshots/di_v0_s4_evidence_container.bin",
    sha256: "22e2a662af3a07458e5713bd004f563e9d038c86fb89f3353d39b8e7ea3504b3",
  },
  {
    role: "analysis_windows_nine",
    repo_relative:
      "research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/reference/TIGUAN_2026-10-22_analysis_windows.csv",
    sha256: "52255b8a7bc89be47385356d9a82650df38da32d80a8611b890dee00e3e83d2d",
  },
] as const;

export const P17_1_WINDOW_OVERLAP = {
  unique_eligible_rows_inside_windows: 50,
  sum_of_per_window_counts: 51,
  double_counted_key: "TC_00084.MOV|138",
  double_counted_windows: ["W08_SPEED_INCREASE_134-138", "W09_SPEED_DECREASE_138-149"],
  root_cause:
    "P17.1 figure 51 sums per-window eligible counts; second 138 lies in overlapping W08/W09 boundaries and is counted twice in the sum but once in unique set.",
} as const;

export const M1_DEFAULTS = {
  vMinKmh: 20,
  rpmVisualUncertaintyPolicyRpm: 500,
  histogramBinWidthRpmPerKmh: 2.5,
  blockSubsampleStrideSeconds: 5,
  videoBoundaryExcludeSeconds: [0, 179] as const,
  peakMinFraction: 0.03,
  modeMergeMaxCenterDeltaRpmPerKmh: 2.5,
  pairingAuthorities: {
    video: "VIDEO_SAME_FRAME_NOMINAL" as const,
    r1: "SAME_EVIDENCE_ROW_INTERVAL_ONLY" as const,
    blockedCross: "BLOCKED_CROSS_SOURCE" as const,
  },
};

export const P16_REGRESSION = {
  videoPairCount: 242,
  block5Count: 49,
  r1SameRowVMin20: 442,
  topModeCenters: [22.5, 37.5, 45.0, 50.0] as const,
  topModeCounts: { 22.5: 26, 37.5: 16, 45.0: 13, 50.0: 14 } as const,
  ratioMedianVMin20: 32.67,
  fableBandCounts: { "20-25": 67, "40-45": 51, "55-60": 22 },
  eligibleClips: ["TC_00080.MOV", "TC_00084.MOV"] as const,
};

export const P17_1_CONTEXT = {
  contractId: "DS4_RPM_M1_VIDEO_DRIVING_CONTEXT_V1",
  labels: ["STEADY", "ACCELERATING", "DECELERATING", "TRANSITION", "UNKNOWN"] as const,
  minNPerStratum: 8,
  /** Unique eligible rows overlapping any TC_00080/84 manoeuvre window (inclusive bounds). */
  windowEligibleOverlapUniqueCount: 50,
  windowEligibleOverlapSumPerWindowP171: 51,
  windowsZeroEligibleVgt20: ["W01", "W02", "W06"] as const,
};

export const RAY_RUN_P18A = {
  classifierEnabled: false,
  readinessNote:
    "P18A exposes typed interfaces only; RAY-RUN population classifier is NOT validated in this PR.",
};
