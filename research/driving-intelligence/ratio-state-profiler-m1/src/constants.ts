/** Research-only M1 constants — frozen P16/P17 defaults. */
export const P16_MANIFEST_SHA256_SELF =
  "5774d38fa2bb96adc89fbe04ca4f37b6ca7b730e06d0febd31bb50b7d9f704e6";

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
  /** Measured on P18A sealed inputs (P7 window filter: TC_00080/84 only). P17.1 design cited 51; recomputation yields 50. */
  windowEligibleOverlapCount: 50,
  windowEligibleOverlapCountP171Design: 51,
  windowsZeroEligibleVgt20: ["W01", "W02", "W06"] as const,
};

export const RAY_RUN_P18A = {
  classifierEnabled: false,
  readinessNote:
    "P18A exposes typed interfaces only; RAY-RUN population classifier is NOT validated in this PR.",
};
