import type { VsiCanonicalSignalKey } from './canonical-signal-keys';

export const VSI_P0A_SIGNAL_INTEGRITY_MATRIX_SCHEMA = 'synqdrive.vsi.signal_integrity_matrix.v1' as const;

export type VsiP0aFindingClass =
  | 'CONFIRMED_BUG'
  | 'MISLEADING_PRESENTATION'
  | 'SEMANTIC_AMBIGUITY'
  | 'EXPECTED_BEHAVIOR'
  | 'INSUFFICIENT_EVIDENCE';

export type VsiP0aFindingPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type VsiP0aApplicability =
  | 'APPLICABLE'
  | 'NOT_APPLICABLE'
  | 'UNKNOWN'
  | 'NOT_DECLARED';

export type VsiP0aVerificationStatus = 'VERIFIED' | 'NOT_VERIFIED' | 'PARTIAL';

export type VsiP0aHfAvailability =
  | 'SUPPORTED_WITH_SAMPLES'
  | 'SUPPORTED_EMPTY'
  | 'NOT_SUPPORTED_BY_PIPELINE'
  | 'NOT_VERIFIED';

export type VsiP0aAuditCohortVehicle = {
  vehicleId: string;
  vehicleLabel: string;
  make: string;
  model: string;
  fuelType: string | null;
  powertrainClass: 'ICE' | 'EV' | 'UNKNOWN';
  providerModality: string | null;
};

export type VsiP0aAuditCohort = {
  organizationId: string;
  vehicles: VsiP0aAuditCohortVehicle[];
};

export type VsiP0aProductionVerification = {
  verifiedAt: string;
  originMainSha: string;
  productionCurrentSha: string;
  productionRelease: string | null;
  replica3001Sha: string | null;
  replica3002Sha: string | null;
  pm2Health: string | null;
  publicHealthOk: boolean;
  pr2255: 'CODE_PRESENT' | 'NOT_PRESENT' | 'NOT_VERIFIED';
  pr2256: 'CODE_PRESENT' | 'NOT_PRESENT' | 'NOT_VERIFIED';
  pr2257: 'CODE_PRESENT' | 'NOT_PRESENT' | 'NOT_VERIFIED';
  frontendArtifact: {
    bundlePath: string | null;
    rpmDualPresent: 'ARTIFACT_PRESENT' | 'NOT_PRESENT' | 'NOT_VERIFIED';
    dualProvenanceTestIdPresent: 'ARTIFACT_PRESENT' | 'NOT_PRESENT' | 'NOT_VERIFIED';
  };
  runtimeDualProvenanceUi: 'RUNTIME_BEHAVIOR_PROVEN' | 'NOT_VERIFIED';
  notes: string[];
};

export type VsiP0aHfEvidenceSlice = {
  availability: VsiP0aHfAvailability;
  sampleCount: number | null;
  tripCount: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  activeCadenceProfile: string | null;
  queryLimits: Record<string, unknown>;
};

export type VsiP0aSignalIntegrityMatrixRow = {
  vehicleId: string;
  vehicleLabel: string;
  provider: string | null;
  sourceLinkId: string;
  canonicalSignal: VsiCanonicalSignalKey | string;
  unit: string;
  applicability: VsiP0aApplicability;
  declaredSupport: string | null;
  snapshotObservation: string | null;
  snapshotQuality: string | null;
  snapshotConfidence: string | null;
  hfAvailability: VsiP0aHfAvailability;
  hfSampleCount: number | null;
  hfTripCount: number | null;
  hfWindowStart: string | null;
  hfWindowEnd: string | null;
  activeCadenceProfile: string | null;
  signalTimestamp: string | null;
  fetchTimestamp: string | null;
  evaluatedAt: string | null;
  freshness: string | null;
  provenance: string[];
  apiPresentation: string;
  uiPresentation: string;
  findingClass: VsiP0aFindingClass;
  severity: VsiP0aFindingPriority;
  evidenceReference: string;
  verificationStatus: VsiP0aVerificationStatus;
};

export type VsiP0aSignalIntegrityMatrixSummary = {
  canonicalSignalCount: number;
  vehicleCount: number;
  matrixRows: number;
  verifiedRows: number;
  notVerifiedRows: number;
  confirmedBugs: number;
  misleadingPresentations: number;
  semanticAmbiguities: number;
  insufficientEvidence: number;
  expectedBehavior: number;
  p0Findings: number;
  p1Findings: number;
  openHypotheses: number;
};

export type VsiP0aSignalIntegrityMatrixDocument = {
  schema: typeof VSI_P0A_SIGNAL_INTEGRITY_MATRIX_SCHEMA;
  auditExecutedAt: string;
  auditTimezone: string;
  queryWindow: {
    hfHistoryDays: number;
    maxFinalizedTrips: number;
    maxRpmPoints: number;
  };
  productionVerification: VsiP0aProductionVerification;
  cohort: VsiP0aAuditCohort;
  summary: VsiP0aSignalIntegrityMatrixSummary;
  rows: VsiP0aSignalIntegrityMatrixRow[];
};
