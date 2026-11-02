/**
 * High-Frequency (HF) telemetry types — ClickHouse analytics mirror only.
 *
 * These types are intentionally framework-free (no Prisma, no Nest imports)
 * so they can be shared by the ClickHouse HF ingestion service and the
 * data-analyse layer without creating circular imports.
 *
 * PostgreSQL stays the canonical truth; HF data is an analytics mirror.
 */

export type HfSignalGroup =
  | 'gps'
  | 'speed'
  | 'powertrain'
  | 'battery'
  | 'charging'
  | 'brake'
  | 'tire'
  | 'environment'
  | 'unknown';

export type HfSignalQuality = 'raw' | 'normalized' | 'estimated' | 'invalid';

export type HfEventSeverity = 'info' | 'watch' | 'warning' | 'critical';

export type HfEventConfidence = 'low' | 'medium' | 'high';

/** Known HF event types (string-typed for forward compatibility). */
export type HfEventType =
  | 'HARSH_ACCELERATION'
  | 'HARSH_BRAKING'
  | 'LAUNCH_LIKE_START'
  | 'SPEED_SPIKE'
  | 'GPS_GAP'
  | 'SIGNAL_GAP'
  | 'CHARGING_SESSION_SIGNAL'
  | (string & {});

/** A single normalized HF signal point (maps to telemetry_hf_points). */
export interface HfSignalPoint {
  orgId: string;
  vehicleId: string;
  tokenId: number;
  /** Origin of the signal, e.g. 'dimo'. */
  source: string;
  signalName: string;
  signalGroup: HfSignalGroup;
  recordedAt: Date;
  valueFloat?: number | null;
  valueInt?: number | null;
  valueBool?: boolean | null;
  valueString?: string | null;
  unit?: string | null;
  quality: HfSignalQuality;
  requestId?: string | null;
  tripId?: string | null;
  bookingId?: string | null;
}

/** Read-only window coverage label (analytics evidence — not a trip score). */
export type HfWindowCoverage = 'good' | 'medium' | 'weak' | 'unavailable' | 'unknown';

/** Per-signal min/max/avg inside a window (stored in stats_json). */
export interface HfWindowScalarStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

/** Extended per-window stats payload (stats_json column). */
export interface HfWindowStatsJson {
  /** Point counts per canonical signal name within this group/window. */
  signalCounts: Record<string, number>;
  /** Min/max/avg for key scalars when present (rpm, throttle, load, speed, soc). */
  scalars?: Record<string, HfWindowScalarStats>;
  /** Battery SOC sample count in this window (when group is battery). */
  socCount?: number;
}

/** An aggregated HF window summary (maps to telemetry_hf_windows). */
export interface HfWindowSummary {
  orgId: string;
  vehicleId: string;
  tripId?: string | null;
  bookingId?: string | null;
  windowStart: Date;
  windowEnd: Date;
  signalGroup: HfSignalGroup;
  pointCount: number;
  sampleIntervalMinMs?: number | null;
  sampleIntervalMaxMs?: number | null;
  sampleIntervalAvgMs?: number | null;
  maxSpeedKmh?: number | null;
  maxAccelMps2?: number | null;
  minAccelMps2?: number | null;
  maxTractionKw?: number | null;
  minTractionKw?: number | null;
  socDeltaPct?: number | null;
  gpsPointCount: number;
  missingGapCount: number;
  largestGapMs?: number | null;
  coverage?: HfWindowCoverage;
  statsJson?: HfWindowStatsJson;
}

// ── Signal quality read model (diagnostics only — never a trip score) ────────

export type TripSignalQualityLevel = 'good' | 'medium' | 'weak' | 'unavailable';

export interface TripSignalCoverageEntry {
  signalGroup: HfSignalGroup | string;
  pointCount: number;
  windowCount: number;
}

export interface TripDetectorFeasibilityHint {
  detector: string;
  status: string;
  requiredSignals: string[];
  speedOnly: boolean;
}

export interface TripSignalQualityResult {
  available: boolean;
  degraded: boolean;
  degradedReason?: string | null;
  /** Read-only evidence label — not persisted as a canonical trip score. */
  overallQuality: TripSignalQualityLevel;
  hfAvailability: 'hf_available' | 'sparse' | 'missing' | 'unknown';
  signalCoverage: TripSignalCoverageEntry[];
  missingKeySignals: string[];
  detectorFeasibilityHints: TripDetectorFeasibilityHint[];
  windowCount: number;
  hfPointCount: number;
  reasons: string[];
  /** Internal debug marker for Data Analyse. */
  internalDebug: true;
  readOnly: true;
}

export interface HfTripWindowsResult {
  available: boolean;
  tripId: string;
  vehicleId: string;
  windows: HfWindowSummary[];
  degradedReason?: string | null;
}

/** A derived HF event (maps to telemetry_hf_events). */
export interface HfDerivedEvent {
  orgId: string;
  vehicleId: string;
  eventType: HfEventType;
  severity: HfEventSeverity;
  eventStart: Date;
  eventEnd?: Date | null;
  durationMs?: number | null;
  confidence: HfEventConfidence;
  primaryValue?: number | null;
  primaryUnit?: string | null;
  /** JSON-serialized evidence payload (never raw secrets). */
  evidenceJson: string;
  tripId?: string | null;
  bookingId?: string | null;
}

// ── Query result shapes (read side) ─────────────────────────────────────────

export interface HfAvailabilitySummary {
  available: boolean;
  vehicleId: string;
  from: string;
  to: string;
  pointCount: number;
  earliestPointAt: string | null;
  latestPointAt: string | null;
  signalGroups: string[];
  /** Set when ClickHouse is disabled/unreachable or the query failed. */
  degradedReason?: string | null;
}

export interface HfSignalFrequencyRow {
  signalName: string;
  signalGroup: string;
  pointCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  avgIntervalMs: number | null;
}

export interface HfSignalFrequencySummary {
  available: boolean;
  vehicleId: string;
  from: string;
  to: string;
  signals: HfSignalFrequencyRow[];
  degradedReason?: string | null;
}

export interface HfEventRow {
  eventType: string;
  severity: string;
  eventStart: string;
  eventEnd: string | null;
  durationMs: number | null;
  confidence: string;
  primaryValue: number | null;
  primaryUnit: string | null;
  tripId: string | null;
  bookingId: string | null;
}

export interface HfRecentEventsResult {
  available: boolean;
  vehicleId: string;
  from: string;
  to: string;
  events: HfEventRow[];
  degradedReason?: string | null;
}

/** Single RPM HF point read from telemetry_hf_points (trip-scoped). */
export interface HfTripRpmPointRow {
  recordedAtMs: number;
  recordedAtIso: string;
  valueRpm: number;
  unit: string | null;
  quality: string;
  orgId: string;
  vehicleId: string;
  tripId: string;
  /** DIMO device token when mirrored; used for VSI source-link HF attribution checks. */
  tokenId: number | null;
}

export type HfTripRpmPointsCompletenessStatus =
  | 'COMPLETE'
  | 'INCOMPLETE_MORE_POINTS_AVAILABLE'
  | 'EMPTY';

export type HfTripRpmPointsReadStatus =
  | 'SUCCESS'
  | 'UNAVAILABLE'
  | 'QUERY_FAILED'
  | 'EMPTY'
  | 'TENANT_SCOPE_VIOLATION';

/** Trip-scoped RPM HF read result (DS4 RPM HF V1A). */
export interface HfTripRpmPointsReadResult {
  status: HfTripRpmPointsReadStatus;
  available: boolean;
  orgId: string;
  vehicleId: string;
  tripId: string;
  tripWindowFromIso: string;
  tripWindowToIso: string;
  signalName: string;
  points: HfTripRpmPointRow[];
  totalMatchingCount: number;
  returnedCount: number;
  /** Rows returned by ClickHouse in this page (before valid-point filtering). */
  rawRowsReturned: number;
  limit: number;
  offset: number;
  completenessStatus: HfTripRpmPointsCompletenessStatus;
  duplicateTimestampCount: number;
  invalidValueCount: number;
  tenantScopeViolation: boolean;
  degradedReason?: string | null;
}
