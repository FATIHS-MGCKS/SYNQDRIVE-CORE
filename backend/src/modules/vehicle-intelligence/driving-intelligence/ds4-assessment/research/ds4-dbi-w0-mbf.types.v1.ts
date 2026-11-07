/**
 * DS4 Driving Behavior Intelligence — W0 Motion Behavior Fingerprint (research only).
 * Pure functions; no Nest, no DB, no production flags.
 */

export type Ds4DbiW0QualityTierV1 = 'STRICT' | 'RELAXED';

/** Provenance for scientific interpretation — never conflate synthetic with sealed real. */
export type Ds4DbiW0EvidenceOriginV1 =
  | 'SEALED_REAL_C4'
  | 'SYNTHETIC_P2_ENRICHMENT'
  | 'SYNTHETIC_CONTROL'
  /** Caller omitted explicit origin — not sealed real; treat as synthetic/unspecified. */
  | 'SYNTHETIC_UNSPECIFIED';

export const DS4_DBI_W0_STRICT_SPEED_QUALITIES: ReadonlySet<string> = new Set(['OK']);

export const DS4_DBI_W0_RELAXED_SPEED_QUALITIES: ReadonlySet<string> = new Set([
  'OK',
  'REPAIRED',
  'SPARSE_SUPPORT',
  'JITTER_SUSPECT',
  'SPAN_SUPPORT',
  'SPAN_DERIVED',
]);

/** Preregistered research candidates (not physical standards). */
export const DS4_DBI_W0_RESEARCH_THRESHOLDS_V1 = {
  minMedianSpeedKmhForVariability: 5,
  minMovingDirectLabelsD4: 120,
  minConsecutivePairsD5: 120,
  minStopEpisodesOrEsSecondsD6: { minStops: 3, minEsSeconds: 600 },
  sustainedMovingRunMinSeconds: 120,
  minDirectStopDurationSeconds: 3,
  burstWindowSeconds: 60,
  burstNextEventMaxSeconds: 30,
  minEventsD8: 10,
  minNonEmptyWindowsD8: 10,
} as const;

export type Ds4DbiW0MbfReasonCodeV1 =
  | 'MBF_W0_OK'
  | 'MBF_W0_NOT_EVALUABLE_NO_MOTION_PAYLOAD'
  | 'MBF_W0_NOT_EVALUABLE_MISSING_SPEED_SERIES'
  | 'MBF_W0_NOT_EVALUABLE_MISSING_FSM_LABELS'
  | 'MBF_W0_NOT_EVALUABLE_MISSING_STOP_EPISODES'
  | 'MBF_W0_NOT_EVALUABLE_MISSING_EVENTS'
  | 'MBF_W0_NOT_EVALUABLE_NO_TRIP_META'
  | 'MBF_W0_INSUFFICIENT_MOVING_DIRECT_LABELS'
  | 'MBF_W0_INSUFFICIENT_CONSECUTIVE_PAIRS'
  | 'MBF_W0_LOW_MEDIAN_SPEED_DENOMINATOR_GUARD'
  | 'MBF_W0_NO_DIRECT_STOP_EVIDENCE'
  | 'MBF_W0_INSUFFICIENT_ES_OR_STOPS_FOR_STOP_STRUCTURE'
  | 'MBF_W0_INSUFFICIENT_EVENTS_FOR_BURSTINESS'
  | 'MBF_W0_INSUFFICIENT_WINDOWS_FOR_BURSTINESS'
  | 'MBF_W0_NOT_EVALUABLE_D8_OBSERVATION_WINDOW'
  | 'MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN'
  | 'MBF_W0_NOT_EVALUABLE_STOP_AUTHORITY_NOT_DIRECT'
  | 'MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY'
  | 'MBF_W0_FAIL_CLOSED_SOURCE_BUNDLE_MISMATCH'
  | 'MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH'
  | 'MBF_W0_FAIL_CLOSED_CORRUPT_LABEL_TIME_ORDER'
  | 'MBF_W0_FAIL_CLOSED_DUPLICATE_SPEED_LABEL'
  | 'MBF_W0_FAIL_CLOSED_INVALID_SPEED_VALUE'
  | 'MBF_W0_FAIL_CLOSED_FSM_DUPLICATE_LABEL'
  | 'MBF_W0_FAIL_CLOSED_FSM_MISSING_FOR_SPEED_LABEL'
  | 'MBF_W0_FAIL_CLOSED_DUPLICATE_EVENT_START_TIME'
  | 'MBF_W0_FAIL_CLOSED_EVENT_VALIDATION'
  | 'MBF_W0_FAIL_CLOSED_UNVERIFIED_SEALED_REAL_C4_CLAIM'
  | 'MBF_W0_SYNTHETIC_CONTROL_SCENARIO';

export type Ds4DbiW0SingleMetricResultV1 = {
  status: 'KNOWN' | 'ABSTAIN';
  value: number | null;
  n: number | null;
  coverage: number | null;
  reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
};

export type Ds4DbiW0TripKernelResultV1 = {
  contractVersion: 'ds4-dbi-w0-mbf-kernel-v1';
  evidenceOrigin: Ds4DbiW0EvidenceOriginV1;
  /** Kernel code path exercised; does not imply sealed real-data validation. */
  implementationWorks: boolean;
  /**
   * Sealed-real C4 statistical gate — **always false in W0** until W1 trusted loader arms provenance.
   * Never true from caller labels, digests, or userland attestation objects alone.
   */
  sealedRealC4StatisticalEligibility: boolean;
  /**
   * Independent scientific validation of real C4 behavior — NOT_EVALUATED until a verified sealed-real loader exists.
   */
  independentScientificValidationStatus: 'NOT_EVALUATED';
  tripId: string;
  sourceMotionRunId: string;
  qualityTier: Ds4DbiW0QualityTierV1;
  speedAuthority: string | null;
  shadowBundleVersion: string | null;
  contentFingerprintExpected: string | null;
  contentFingerprintObserved: string | null;
  /** P2 CSV sealed fingerprint (SHA-256) when provided — distinct from canonical JSON hash of payload. */
  sealedReferenceContentFingerprintSha256: string | null;
  exposureSecondsEs: number | null;
  distanceKm: number | null;
  coverageDiagnostics: {
    speedLabelsAdmissibleTier: number;
    speedTimeSpanSeconds: number | null;
    consecutiveOneSecondPairsInSeries: number;
    movingDirectLabelSecondsEstimated: number;
    d4EligibleMovingDirectLabels: number | null;
    d5EligibleConsecutiveMovingDirectPairs: number | null;
  };
  d4SpeedVariabilityRobustCv: Ds4DbiW0SingleMetricResultV1;
  d5SpeedRoughnessMeanAbsDeltaKmhPerS: Ds4DbiW0SingleMetricResultV1;
  d6StopStructure: {
    status: 'KNOWN' | 'ABSTAIN' | 'NOT_AVAILABLE';
    directStopCount: number | null;
    stopsPerKm: number | null;
    medianMovingRunDurationSeconds: number | null;
    sustainedMovementShare: number | null;
    movingRunSplitReasonSample: Ds4DbiW0MbfReasonCodeV1[];
    reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  };
  d8Burstiness: {
    status: 'KNOWN' | 'ABSTAIN';
    indexOfDispersion: number | null;
    shareNextEventWithin30s: number | null;
    windowCount: number | null;
    nonEmptyWindowCount: number | null;
    emptyWindowCount: number | null;
    totalWindowSlots: number | null;
    eventCount: number | null;
    observationWindowStartMsUtc: number | null;
    observationWindowEndMsUtc: number | null;
    observationWindowDurationSeconds: number | null;
    reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  };
  diagnostics: {
    speedRowCount: number;
    fsmRowCount: number;
    movingDirectLabelCount: number;
    consecutiveOneSecondPairCount: number;
    directStopEpisodeCount: number;
    eventCount: number;
    repairedSpeedLabelCount: number;
    inputValidationReasons: Ds4DbiW0MbfReasonCodeV1[];
    failClosedReasons: Ds4DbiW0MbfReasonCodeV1[];
  };
};
