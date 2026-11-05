export interface RegimeCandidate {
  center_k: number;
  weight: number;
  sigma_k_approx: number;
}

export interface SeparabilityInput {
  candidates: RegimeCandidate[];
  z_threshold: number;
  require_both_clips: boolean;
}

export interface SeparabilityResult {
  status: "NOT_ENABLED_P18A";
  merged_pairs: Array<{ a: number; b: number; merged: boolean }>;
  message: string;
}

export function assessSeparability(_input: SeparabilityInput): SeparabilityResult {
  return {
    status: "NOT_ENABLED_P18A",
    merged_pairs: [],
    message: "Separability merge test (I3) is typed only in P18A.",
  };
}
