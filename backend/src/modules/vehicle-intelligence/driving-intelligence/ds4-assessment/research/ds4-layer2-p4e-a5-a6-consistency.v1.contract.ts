import type { Ds4LongitudinalLoadKindObservablesV1 } from '../ds4-longitudinal-load-observables.v1.contract';

export const DS4_LAYER2_P4E_A5_A6_CONSISTENCY_SCHEMA_VERSION_V1 =
  'DS4_LAYER2_P4E_A5_A6_CONSISTENCY_V1' as const;

/** Duration-tier label from P4B / P2 (`FULL_ELIGIBLE` vs `BIN_ONLY`). */
export type Ds4Layer2P4eA5SpeedSupportDurationTierV1 = 'FULL_ELIGIBLE' | 'BIN_ONLY' | 'OTHER';

export type Ds4Layer2P4eA5SecantSupportStatusV1 =
  | 'SUPPORTED'
  | 'UNAVAILABLE_MISSING_BOUNDARY_SPEED'
  | 'UNAVAILABLE_ZERO_DURATION'
  | 'UNAVAILABLE_MISSING_MEAN_ACCEL';

export type Ds4Layer2P4eA5ShapeIndexStatusV1 =
  | 'DEFINED'
  | 'UNAVAILABLE_ZERO_BOUNDARY_DELTA'
  | 'UNAVAILABLE_MISSING_WINDOW_MEAN'
  | 'UNAVAILABLE_MISSING_BOUNDARY_SPEED';

export type Ds4Layer2P4eA5EventConsistencyDiagnosticV1 = {
  tripId: string;
  eventIndex: number;
  eventKind: string;
  durationTier: string;
  speedSupportDurationTier: Ds4Layer2P4eA5SpeedSupportDurationTierV1;
  eligibilityClassification: string;
  durationS: number | null;
  meanAccelMps2: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  boundaryDeltaSpeedMps: number | null;
  secantAccelMps2: number | null;
  /** Signed impulse residual: meanAccel×T − |Δv_boundary| [m/s]. */
  secantImpulseResidualMps: number | null;
  /** |secantImpulseResidualMps| [m/s]. */
  secantImpulseResidualAbsMps: number | null;
  /** Signed acceleration residual: meanAccel − secantAccel [m/s²]. */
  secantAccelResidualMps2: number | null;
  secantAccelResidualAbsMps2: number | null;
  secantSupportStatus: Ds4Layer2P4eA5SecantSupportStatusV1;
  /** Dimensionless (windowMean − midBoundary) / |Δv_boundary_kmh|; null when unavailable. */
  eventShapeIndex: number | null;
  eventShapeIndexStatus: Ds4Layer2P4eA5ShapeIndexStatusV1;
  windowMeanSpeedKmh: number | null;
  windowEvidenceClass: string;
  boundaryEvidenceClass: string;
  repairInfluenced: boolean;
};

export type Ds4Layer2P4eA6TierImpulseSemanticsV1 =
  | 'DECOMPOSED'
  | 'ZERO_LOAD'
  | 'UNAVAILABLE';

export type Ds4Layer2P4eA6KindTierDecompositionV1 = {
  kind: 'acceleration' | 'deceleration';
  bTotalMps: number | null;
  bFullMps: number | null;
  bBinOnlyMps: number | null;
  fullContributionShare: number | null;
  binOnlyContributionShare: number | null;
  admissibleEventCount: number;
  fullEventCount: number;
  binOnlyEventCount: number;
  tierImpulseSemantics: Ds4Layer2P4eA6TierImpulseSemanticsV1;
  /** Mirrors load-model kind observables (unchanged producer). */
  loadKindObservables: Ds4LongitudinalLoadKindObservablesV1;
  bTotalMatchesLoadModelB: boolean | null;
  bFullPlusBinMatchesTotal: boolean | null;
};

export type Ds4Layer2P4eA6TripTierDecompositionV1 = {
  tripId: string;
  acceleration: Ds4Layer2P4eA6KindTierDecompositionV1;
  deceleration: Ds4Layer2P4eA6KindTierDecompositionV1;
};

export type Ds4Layer2P4eA5A6TripDiagnosticsV1 = {
  tripId: string;
  a5Events: Ds4Layer2P4eA5EventConsistencyDiagnosticV1[];
  a6: Ds4Layer2P4eA6TripTierDecompositionV1;
};

export type Ds4Layer2P4eA5A6CohortSummaryV1 = {
  schemaVersion: typeof DS4_LAYER2_P4E_A5_A6_CONSISTENCY_SCHEMA_VERSION_V1;
  admissibleEventCount: number;
  a5SecantSupportedCount: number;
  a5ShapeDefinedCount: number;
  a5SecantUnavailableCount: number;
  a5ShapeUnavailableCount: number;
  a6KindCellsDecomposed: number;
  a6KindCellsZeroLoad: number;
  a6KindCellsUnavailable: number;
  maxAbsSecantImpulseResidualMps: number | null;
};
