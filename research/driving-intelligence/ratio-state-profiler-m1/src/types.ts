export type PairingAuthority =
  | "VIDEO_SAME_FRAME_NOMINAL"
  | "SAME_EVIDENCE_ROW_INTERVAL_ONLY"
  | "BLOCKED_CROSS_SOURCE"
  | "BLOCKED";

export type DrivingContextLabel =
  | "STEADY"
  | "ACCELERATING"
  | "DECELERATING"
  | "TRANSITION"
  | "UNKNOWN";

export interface VideoEligibleRow {
  source_clip: string;
  video_second: number;
  speed_kmh: number;
  rpm: number;
  ratio: number;
  pairing_authority: "VIDEO_SAME_FRAME_NOMINAL";
  p5_evidence_class: string;
}

export interface R1SameRowPair {
  bucket_utc: string;
  speed_kmh: number;
  rpm: number;
  ratio: number;
  pairing_authority: "SAME_EVIDENCE_ROW_INTERVAL_ONLY";
}

export interface RatioStableRun {
  clip: string;
  start_second: number;
  end_second: number;
  n_seconds: number;
  k_hat: number;
  k_sigma_approx: number;
  break_reason_start?: RunBreakClass;
}

export type RunBreakClass =
  | "UNCERTAINTY_GATE"
  | "CLIP_BOUNDARY"
  | "GAP"
  | "TRANSITION_CONTEXT";

export interface ModeCandidate {
  id: string;
  center_rpm_per_kmh: number;
  count: number;
  fraction: number;
}

export interface BaselineB0B1 {
  b0_histogram_peaks: ModeCandidate[];
  b0_top_four_centers: number[];
  block5_n: number;
  block5_peaks: ModeCandidate[];
}

export interface NegativeControlResult {
  control_id: string;
  verdict: "PASS" | "FAIL" | "INFORMATIVE";
  detail: string;
  metrics?: Record<string, unknown>;
}

export interface RayRunInterfaceReadiness {
  ray_fit: "TYPED_STUB_ONLY";
  separability: "TYPED_STUB_ONLY";
  abstain_state: "TYPED_STUB_ONLY";
  context_stratify: "PARTIAL_IMPLEMENTED_P17_1";
  classifier_validated: false;
}
