/** APDS V3 offline-only decision surface (never wired to production enqueue). */
export const APDS_V3_OFFLINE_POLICY_VERSION = 'APDS_V3_OFFLINE_P1B0' as const;

export type ApdsV3OfflineDecisionKind =
  | 'WOULD_POLL'
  | 'WOULD_SKIP'
  | 'FORCED_SAFETY_POLL'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_ASSESSABLE';

export type ApdsV3TimestampProvenance =
  | 'PROVIDER_SOURCE'
  | 'OBSERVED_AT'
  | 'FETCHED_AT'
  | 'PROCESSING';

export type ApdsV3OfflinePolicyInput = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string | null;
  decisionAtMs: number;
  reconciliation: boolean;
  tripFsmState: 'RESTING' | 'ACTIVE' | 'UNKNOWN';
  activityTier: string;
  lastPhysicalPollMs: number | null;
  lastLvProviderSourceMs: number | null;
  lastProviderFetchedAtMs: number | null;
  lastTopLevelProviderSourceMs: number | null;
  profileClass:
    | 'STABLE_PERIODIC'
    | 'MULTIMODAL'
    | 'INSUFFICIENT_EVIDENCE'
    | 'SPARSE_IRREGULAR'
    | 'PROVIDER_OBSERVABILITY_GAP';
  medianIntervalMs: number;
  providerGapOpen: boolean;
  providerWakeOrReconnect: boolean;
  sourceLinkInvalidated: boolean;
  providerErrorRecent: boolean;
  /** P2C proof of top-level advance exists at decision time (not future). */
  p2cTopLevelAdvanceKnown: boolean;
  p2cObservationId?: string | null;
  /** When the P2C observation row was readable at or before decisionAtMs */
  p2cObservationAvailableAtMs?: number | null;
  p2cBoundOrganizationId?: string | null;
  p2cBoundVehicleId?: string | null;
  p2cBoundProviderSourceLinkId?: string | null;
  p2cDataSourceTimestampMs?: number | null;
  p2cObservationCoverageVerified?: boolean;
  /** Replay-only: LV strict source advance evidenced before decision (not staleness proxy) */
  lvStrictSourceAdvanceObservedAtMs?: number | null;
  consumerDemandRevision: string;
  signalProfileRevision: string | null;
  signalProfileRevisionEffectiveAtMs?: number | null;
  lastObservedAtMs?: number | null;
  /** Exclude KS_MX_2024 calibration vehicle id fingerprint */
  excludeFromOptimizationCalibration?: boolean;
};

export type ApdsV3OfflinePolicyDecision = {
  policyVersion: typeof APDS_V3_OFFLINE_POLICY_VERSION;
  decision: ApdsV3OfflineDecisionKind;
  reason: string;
  expectedInformationGain: number | null;
  heuristic: boolean;
  hardSafetyTriggered: boolean;
};
