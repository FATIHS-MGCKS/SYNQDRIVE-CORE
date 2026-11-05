export interface AbstainStateInput {
  speed_kmh: number;
  posterior_by_regime: Record<string, number>;
  regime_centers_k: number[];
  rpm_uncertainty_policy_rpm: number;
  posterior_threshold: number;
}

export type PerSecondStateLabel = "ABSTAIN" | `REGIME_${number}`;

export interface AbstainStateResult {
  status: "NOT_ENABLED_P18A";
  label: PerSecondStateLabel;
  reason: string;
}

export function classifyPerSecondState(_input: AbstainStateInput): AbstainStateResult {
  return {
    status: "NOT_ENABLED_P18A",
    label: "ABSTAIN",
    reason: "Per-second RAY-RUN state (I5) is not enabled in P18A foundation.",
  };
}
