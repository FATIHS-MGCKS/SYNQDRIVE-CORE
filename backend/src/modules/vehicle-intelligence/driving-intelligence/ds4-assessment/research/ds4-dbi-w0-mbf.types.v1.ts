/**
 * DS4 Driving Behavior Intelligence — W0 Motion Behavior Fingerprint (research only).
 * Pure functions; no Nest, no DB, no production flags.
 */

export type Ds4DbiW0QualityTierV1 = 'STRICT' | 'RELAXED';

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
  | 'MBF_W0_GAP_BREAKS_CONSECUTIVE_CHAIN'
  | 'MBF_W0_NOT_EVALUABLE_STOP_AUTHORITY_NOT_DIRECT'
  | 'MBF_W0_FAIL_CLOSED_MIXED_SPEED_AUTHORITY'
  | 'MBF_W0_FAIL_CLOSED_SOURCE_BUNDLE_MISMATCH'
  | 'MBF_W0_FAIL_CLOSED_CONTENT_FINGERPRINT_MISMATCH'
  | 'MBF_W0_FAIL_CLOSED_CORRUPT_LABEL_TIME_ORDER'
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
  tripId: string;
  sourceMotionRunId: string;
  qualityTier: Ds4DbiW0QualityTierV1;
  speedAuthority: string | null;
  shadowBundleVersion: string | null;
  contentFingerprintExpected: string | null;
  contentFingerprintObserved: string | null;
  exposureSecondsEs: number | null;
  distanceKm: number | null;
  d4SpeedVariabilityRobustCv: Ds4DbiW0SingleMetricResultV1;
  d5SpeedRoughnessMeanAbsDeltaKmhPerS: Ds4DbiW0SingleMetricResultV1;
  d6StopStructure: {
    status: 'KNOWN' | 'ABSTAIN' | 'NOT_AVAILABLE';
    directStopCount: number | null;
    stopsPerKm: number | null;
    medianMovingRunDurationSeconds: number | null;
    sustainedMovementShare: number | null;
    reasonCodes: Ds4DbiW0MbfReasonCodeV1[];
  };
  d8Burstiness: {
    status: 'KNOWN' | 'ABSTAIN';
    indexOfDispersion: number | null;
    shareNextEventWithin30s: number | null;
    windowCount: number | null;
    eventCount: number | null;
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
  };
};
