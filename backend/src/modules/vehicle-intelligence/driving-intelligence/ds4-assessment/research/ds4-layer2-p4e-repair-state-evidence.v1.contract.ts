export const DS4_LAYER2_P4E_REPAIR_STATE_EVIDENCE_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P4E_REPAIR_STATE_EVIDENCE_V1' as const;

/** Persisted C5.1 repair evaluation states (see c5-1-gated-repair.constants.ts). */
export type Ds4Layer2P4ePersistedRepairStateV1 =
  | 'REPAIR_ACCEPTED'
  | 'REPAIR_REJECTED'
  | 'PASS_THROUGH_OUTSIDE_WINDOW'
  | 'PASS_THROUGH_NO_REPAIR'
  | 'UNCERTAIN'
  | (string & {});

export type Ds4Layer2P4eRepairEvidenceAvailabilityV1 =
  | 'NOT_APPLICABLE_C4_ONLY'
  | 'PAYLOAD_ROWS_PRESENT'
  | 'PAYLOAD_ROWS_MISSING'
  | 'UNKNOWN_REPAIR_STATE';

export type Ds4Layer2P4eBoundaryRepairStateV1 =
  | 'REPAIR_ACCEPTED'
  | 'REPAIR_REJECTED'
  | 'PASS_THROUGH_OUTSIDE_WINDOW'
  | 'PASS_THROUGH_NO_REPAIR'
  | 'UNCERTAIN'
  | 'NO_ROW_AT_BOUNDARY'
  | 'UNAVAILABLE';

export type Ds4Layer2P4eWindowSpeedLimitationV1 =
  | 'INSUFFICIENT_SPEED_SAMPLES'
  | 'BIN_ONLY_SPARSE_SUPPORT'
  | 'NO_NUMERIC_SPEED_IN_WINDOW'
  /** @deprecated Legacy P4B sidecar limitation — any non-NONE repairState row in window. */
  | 'REPAIR_INFLUENCED_SAMPLE'
  | 'REPAIR_ACCEPTED_IN_WINDOW'
  | 'REPAIR_SUSPICION_IN_WINDOW';

export type Ds4Layer2P4eRepairStateHistogramV1 = {
  repairAcceptedInWindow: number;
  repairRejectedInWindow: number;
  repairUncertainInWindow: number;
  repairPassThroughInWindow: number;
  repairUnknownStateInWindow: number;
  inWindowRepairRowCount: number;
};

export type Ds4Layer2P4eRepairStateEvidenceV1 = {
  repairEvidenceAvailability: Ds4Layer2P4eRepairEvidenceAvailabilityV1;
  payloadSpeedAuthority: string | null;
  /** Legacy P4B predicate (reproduces historical 40/129 on pinned C5.1 cohort). */
  repairInfluencedLegacy: boolean;
  /** True only when at least one in-window persisted row has repairState REPAIR_ACCEPTED. */
  repairAcceptedInWindow: boolean;
  /** True when rejected or uncertain evaluation rows appear in-window without accepted repair. */
  repairSuspicionInWindow: boolean;
  boundaryStartRepairState: Ds4Layer2P4eBoundaryRepairStateV1;
  boundaryEndRepairState: Ds4Layer2P4eBoundaryRepairStateV1;
  histogram: Ds4Layer2P4eRepairStateHistogramV1;
  limitations: Ds4Layer2P4eWindowSpeedLimitationV1[];
};

export const DS4_LAYER2_P4E_SIDECAR_ARTIFACT_FILES_V1 = [
  'p4e_manifest.json',
  'p4e_event_speed_evidence.csv',
  'p4e_repair_state_histogram.json',
  'p4e_join_exclusions.csv',
  'p4e_coverage_summary.json',
  'P4E_VALIDATION_REPORT.md',
] as const;
