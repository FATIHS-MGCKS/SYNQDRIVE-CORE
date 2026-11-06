import type { VideoEligibleRow } from "../types.js";

export interface RayFitObservation {
  speed_kmh: number;
  rpm: number;
}

export interface RayFitInput {
  observations: RayFitObservation[];
  /** Policy half-width in rpm — not a calibrated probability distribution. */
  rpm_uncertainty_policy_rpm: number;
}

export interface RayFitResult {
  status: "NOT_ENABLED_P18A";
  message: string;
  k_hat?: number;
  k_sigma_policy_approx?: number;
}

export function rayFit(_input: RayFitInput): RayFitResult {
  return {
    status: "NOT_ENABLED_P18A",
    message: "Origin-ray mixture (I1) is typed only in P18A; no validated classifier output.",
  };
}

export function rayFitFromEligibleRows(_rows: VideoEligibleRow[]): RayFitResult {
  return rayFit({ observations: [], rpm_uncertainty_policy_rpm: 500 });
}
