export const VSI_MASTER_FSD_READ_CONTRACT_V1 = 'vsi-master-fsd-read-v1' as const;

export type MasterFsdCatalogAvailabilityV1 =
  | 'AUTHORITATIVE_LIVE'
  | 'PRESENT_NOT_AUTHORITATIVE'
  | 'CATALOG_PENDING'
  | 'INVALIDATED'
  | 'NOT_AVAILABLE';

export type MasterFsdExecutionAvailabilityV1 =
  | 'NOT_YET_EXECUTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'INVALIDATED'
  | 'UNKNOWN';

export type MasterFsdStageEvidenceAvailabilityV1 =
  | 'NOT_EXECUTED'
  | 'NOT_AVAILABLE'
  | 'PARTIAL'
  | 'AVAILABLE';

export type MasterFsdProvenanceClassV1 = 'LIVE_DIMO_VERIFIED' | 'INTEGRATION_MOCK_DISPOSABLE' | 'UNVERIFIED';

export type MasterFsdSignalPresentationStateV1 =
  | 'DECLARED_ONLY'
  | 'QUERY_PLANNED'
  | 'QUERY_ACCEPTED'
  | 'QUERY_FAILED'
  | 'OBSERVED'
  | 'NOT_EVALUABLE'
  | 'DEFERRED'
  | 'NULL_OBSERVED'
  | 'MISSING'
  | 'INVALID'
  | 'UNKNOWN';

export type MasterFsdSummaryDtoV1 = {
  contractVersion: typeof VSI_MASTER_FSD_READ_CONTRACT_V1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  catalog: {
    availability: MasterFsdCatalogAvailabilityV1;
    provenanceClass: MasterFsdProvenanceClassV1;
    declaredSignalCount: number | null;
    authoritativeRunId: string | null;
    declaredCatalogFingerprint: string | null;
    rejectionReason: string | null;
    selectionLimitation: string | null;
  };
  execution: {
    fsd3: {
      discoveryStream: 'FSD3_CATALOG_SNAPSHOT';
      state: MasterFsdExecutionAvailabilityV1;
      latestActivityRunId: string | null;
      latestRunId: string | null;
      lastCompletedAt: string | null;
    };
    fsd4: {
      discoveryStream: 'FSD4_HISTORICAL';
      state: MasterFsdExecutionAvailabilityV1;
      latestRunId: string | null;
      lastCompletedAt: string | null;
      historicalCrossStreamLink: 'NOT_AVAILABLE' | 'UNVERIFIED_LINK' | 'LINKED';
    };
  };
  evidence: {
    snapshot: MasterFsdStageEvidenceAvailabilityV1;
    historical: MasterFsdStageEvidenceAvailabilityV1;
    historicalCrossStreamLimitation: string | null;
  };
  invalidation: {
    isInvalidated: boolean;
    invalidatedAt: string | null;
    supersededByRunId: string | null;
  };
  vsiProfileCompositionHints: {
    organizationId: string;
    vehicleId: string;
    providerSourceLinkId: string;
  };
};

export type MasterFsdHistoricalColumnV1 =
  | 'NOT_EXECUTED'
  | 'NOT_AVAILABLE'
  | 'UNVERIFIED_LINK'
  | MasterFsdSignalPresentationStateV1;

export type MasterFsdSignalExplorerItemV1 = {
  providerNativeSignalName: string;
  declaredByProvider: boolean;
  schemaShape: string | null;
  presentationState: MasterFsdSignalPresentationStateV1;
  catalogDeclared: boolean;
  snapshotEvidence: 'NOT_EXECUTED' | 'NOT_AVAILABLE' | 'PARTIAL' | MasterFsdSignalPresentationStateV1;
  historicalEvidence: MasterFsdHistoricalColumnV1;
  catalogQuery: { queryPlanned: boolean; queryAccepted: boolean | null; observedValue: boolean | null };
  snapshotQuery: { queryPlanned: boolean; queryAccepted: boolean | null; observedValue: boolean | null } | null;
  historicalQuery: { queryPlanned: boolean; queryAccepted: boolean | null; observedValue: boolean | null } | null;
  coverageAggregate: {
    observedCount: number | null;
    nullCount: number | null;
    missingCount: number | null;
    invalidCount: number | null;
    note: string;
  } | null;
  sourceRunId: string | null;
  provenanceReference: string | null;
};

export type MasterFsdSignalExplorerPageDtoV1 = {
  contractVersion: typeof VSI_MASTER_FSD_READ_CONTRACT_V1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  catalogRunId: string | null;
  catalogAuthoritative: boolean;
  historicalLink: 'NOT_AVAILABLE' | 'UNVERIFIED_LINK' | 'LINKED';
  items: MasterFsdSignalExplorerItemV1[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
  aggregates: {
    declaredSignalCount: number | null;
    logicalSignalsReturned: number;
  };
};

export type MasterFsdRunHistoryItemV1 = {
  runId: string;
  discoveryStream: string;
  status: string;
  providerSourceLinkId: string;
  createdAt: string;
  completedAt: string | null;
  invalidatedAt: string | null;
  supersededByRunId: string | null;
  stages: Array<{ stageType: string; status: string }>;
  catalogSignalCount: number | null;
  evidenceCounts: {
    snapshotRows: number | null;
    historicalRows: number | null;
  };
  ledgerSummary: {
    persistedAttemptCount: number | null;
    budgetTotal: number | null;
    outcomeCounts: Record<string, number> | null;
    note: string;
  };
  failureClass: string | null;
  diagnosticCodes: string[];
};

export type MasterFsdRunHistoryPageDtoV1 = {
  contractVersion: typeof VSI_MASTER_FSD_READ_CONTRACT_V1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  items: MasterFsdRunHistoryItemV1[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
};

export type MasterFsdLedgerAttemptLifecycleV1 =
  | 'RESERVED_UNDISPATCHED'
  | 'RESERVED_SETTLING'
  | 'DISPATCHED'
  | 'SETTLED_SUCCEEDED'
  | 'SETTLED_FAILED'
  | 'SETTLED_UNKNOWN'
  | 'MALFORMED';

export type MasterFsdSafeLedgerAttemptV1 = {
  stageType: string;
  attemptKey: string;
  queryFingerprint: string;
  outcome: string;
  reservedAt: string;
  finishedAt: string | null;
  httpStatus: number | null;
  lifecycle: MasterFsdLedgerAttemptLifecycleV1;
};

export type MasterFsdRunInspectorDtoV1 = {
  contractVersion: typeof VSI_MASTER_FSD_READ_CONTRACT_V1;
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  runId: string;
  discoveryStream: string;
  status: string;
  stages: Array<{
    stageType: string;
    status: string;
    version: number;
    lastHttpStatus: number | null;
  }>;
  catalogProvenance: {
    class: MasterFsdProvenanceClassV1;
    declaredSignalCount: number | null;
    authoritative: boolean;
    rejectionReason: string | null;
  };
  ledger: {
    budgetTotal: number | null;
    budgetByStage: Record<string, number | null>;
    persistedAttemptCount: number | null;
    deduplicatedAttemptKeys: number | null;
    outcomeCounts: Record<string, number> | null;
    malformedCheckpointStages: string[];
    reconciliationNote: string;
    attempts: MasterFsdSafeLedgerAttemptV1[];
  };
  evidenceCoverage: {
    snapshot: MasterFsdStageEvidenceAvailabilityV1;
    historical: MasterFsdStageEvidenceAvailabilityV1;
    observationCounts: {
      observed: number;
      nullObserved: number;
      deferred: number;
      queryFailed: number;
      absent: number;
      other: number;
      total: number;
    } | null;
  };
  cadence: {
    nativePollingFrequencyProven: boolean;
    note: string;
  };
  aggregationSemantics: {
    aggregated1sIsProvenNative1Hz: false;
    note: string;
  };
};
