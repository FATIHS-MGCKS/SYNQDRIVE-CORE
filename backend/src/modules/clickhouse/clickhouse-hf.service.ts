import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';
import type {
  HfAvailabilitySummary,
  HfDerivedEvent,
  HfEventRow,
  HfRecentEventsResult,
  HfSignalFrequencyRow,
  HfSignalFrequencySummary,
  HfSignalPoint,
  HfTripRpmPointRow,
  HfTripRpmPointsCompletenessStatus,
  HfTripRpmPointsReadResult,
  HfTripWindowsResult,
  HfWindowSummary,
} from './clickhouse-hf.types';
import { parseHfRpmValueFloat } from './hf-rpm-value-parse.util';

const HF_POINTS_TABLE = 'telemetry_hf_points';
const HF_EVENTS_TABLE = 'telemetry_hf_events';
const HF_WINDOWS_TABLE = 'telemetry_hf_windows';

/** DIMO/VSS field stored in telemetry_hf_points.signal_name for engine RPM HF. */
export const HF_ENGINE_RPM_SIGNAL_NAME = 'powertrainCombustionEngineSpeed';

/** Default max rows per trip RPM read — explicit incompleteness when exceeded. */
export const HF_TRIP_RPM_DEFAULT_READ_LIMIT = 12_000;

/**
 * Serializes a JS Date into the string ClickHouse's `parseDateTime64BestEffort`
 * expects for a `DateTime64(3,'UTC')` column: `YYYY-MM-DD HH:MM:SS.mmm` (UTC,
 * no `T`, no `Z`). Milliseconds are preserved so a 24h/7d window is never
 * silently widened/narrowed. Inserts use the numeric Unix-ms form
 * (`Date.getTime()`), which DateTime64(3) stores as raw ms ticks — the exact
 * same pattern as the proven telemetry_snapshots mirror, so insert and read
 * stay aligned end-to-end.
 *
 * Exported for unit tests (timestamp round-trip / non-empty window guard).
 */
export function toChDateTimeParam(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Parses a ClickHouse `DateTime64(3,'UTC')` JSONEachRow value
 * (`YYYY-MM-DD HH:MM:SS.mmm`) back into an ISO-8601 UTC string. Returns null on
 * empty/invalid input. Exported for unit tests.
 */
export function parseChUtc(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * ClickHouseHfService
 *
 * Ingestion + read layer for the High-Frequency telemetry mirror.
 *
 * Contract:
 *   - Inserts are BEST-EFFORT: if ClickHouse is unavailable, they skip + log +
 *     return (never throw). No operational SynqDrive flow may be blocked by an
 *     HF/ClickHouse outage.
 *   - Read methods degrade gracefully: when ClickHouse is unavailable or a query
 *     fails they return a degraded response (available=false) rather than crash
 *     a caller such as data-analyse.
 *   - Empty input arrays are never inserted.
 *   - Logs never contain secrets.
 */
@Injectable()
export class ClickHouseHfService {
  private readonly logger = new Logger(ClickHouseHfService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /**
   * Idempotency guard: returns true if any HF points are already mirrored for a
   * given trip. Used by the post-trip mirror so re-running enrichment does not
   * duplicate rows in the append-only telemetry_hf_points table. Degrades to
   * false on any failure (best-effort — never blocks enrichment).
   */
  async hasTripHfPoints(vehicleId: string, tripId: string): Promise<boolean> {
    if (!this.ch.isAvailable) return false;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
          LIMIT 1
        `,
        query_params: { vehicleId, tripId },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0) > 0;
    } catch (err: unknown) {
      this.logger.warn(`hasTripHfPoints failed: ${(err as Error).message}`);
      return false;
    }
  }

  /** Best-effort bulk insert of normalized HF signal points. */
  async insertHfPoints(points: HfSignalPoint[]): Promise<void> {
    if (!points || points.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_POINTS_TABLE,
        result: 'skipped_unavailable',
      });
      this.logger.debug(
        `HF points insert skipped (ClickHouse unavailable) — ${points.length} point(s).`,
      );
      return;
    }

    const rows = points.map((p) => ({
      org_id: p.orgId,
      vehicle_id: p.vehicleId,
      token_id: p.tokenId,
      source: p.source,
      signal_name: p.signalName,
      signal_group: p.signalGroup,
      recorded_at: p.recordedAt.getTime(),
      value_float: p.valueFloat ?? null,
      value_int: p.valueInt ?? null,
      value_bool: p.valueBool == null ? null : p.valueBool ? 1 : 0,
      value_string: p.valueString ?? null,
      unit: p.unit ?? null,
      quality: p.quality,
      request_id: p.requestId ?? null,
      trip_id: p.tripId ?? null,
      booking_id: p.bookingId ?? null,
    }));

    try {
      await this.ch.getClient().insert({
        table: HF_POINTS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_POINTS_TABLE,
        result: 'success',
      });
      this.metrics?.hfPointsInsertedTotal.inc(rows.length);
      const latestMs = Math.max(...points.map((p) => p.recordedAt.getTime()));
      if (Number.isFinite(latestMs)) {
        this.metrics?.clickHouseLastMirrorUnixSeconds.set(
          { table: HF_POINTS_TABLE },
          latestMs / 1000,
        );
      }
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_POINTS_TABLE,
        result: 'error',
      });
      this.ch.markUnavailable((err as Error).message);
      this.logger.warn(`insertHfPoints failed: ${(err as Error).message}`);
    }
  }

  /** Best-effort bulk insert of derived HF events. */
  async insertHfEvents(events: HfDerivedEvent[]): Promise<void> {
    if (!events || events.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_EVENTS_TABLE,
        result: 'skipped_unavailable',
      });
      this.logger.debug(
        `HF events insert skipped (ClickHouse unavailable) — ${events.length} event(s).`,
      );
      return;
    }

    const rows = events.map((e) => ({
      org_id: e.orgId,
      vehicle_id: e.vehicleId,
      event_type: e.eventType,
      severity: e.severity,
      event_start: e.eventStart.getTime(),
      event_end: e.eventEnd ? e.eventEnd.getTime() : null,
      duration_ms: e.durationMs ?? null,
      confidence: e.confidence,
      primary_value: e.primaryValue ?? null,
      primary_unit: e.primaryUnit ?? null,
      evidence_json: e.evidenceJson ?? '',
      trip_id: e.tripId ?? null,
      booking_id: e.bookingId ?? null,
    }));

    try {
      await this.ch.getClient().insert({
        table: HF_EVENTS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_EVENTS_TABLE,
        result: 'success',
      });
      this.metrics?.hfEventsDetectedTotal.inc(rows.length);
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_EVENTS_TABLE,
        result: 'error',
      });
      this.ch.markUnavailable((err as Error).message);
      this.logger.warn(`insertHfEvents failed: ${(err as Error).message}`);
    }
  }

  /** Best-effort bulk insert of HF window aggregates (ReplacingMergeTree). */
  async insertHfWindows(windows: HfWindowSummary[]): Promise<void> {
    if (!windows || windows.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_WINDOWS_TABLE,
        result: 'skipped_unavailable',
      });
      this.logger.debug(
        `HF windows insert skipped (ClickHouse unavailable) — ${windows.length} window(s).`,
      );
      return;
    }

    const rows = windows.map((w) => ({
      org_id: w.orgId,
      vehicle_id: w.vehicleId,
      trip_id: w.tripId ?? null,
      booking_id: w.bookingId ?? null,
      window_start: w.windowStart.getTime(),
      window_end: w.windowEnd.getTime(),
      signal_group: w.signalGroup,
      point_count: w.pointCount,
      sample_interval_min_ms: w.sampleIntervalMinMs ?? null,
      sample_interval_max_ms: w.sampleIntervalMaxMs ?? null,
      sample_interval_avg_ms: w.sampleIntervalAvgMs ?? null,
      max_speed_kmh: w.maxSpeedKmh ?? null,
      max_accel_mps2: w.maxAccelMps2 ?? null,
      min_accel_mps2: w.minAccelMps2 ?? null,
      max_traction_kw: w.maxTractionKw ?? null,
      min_traction_kw: w.minTractionKw ?? null,
      soc_delta_pct: w.socDeltaPct ?? null,
      gps_point_count: w.gpsPointCount,
      missing_gap_count: w.missingGapCount,
      largest_gap_ms: w.largestGapMs ?? null,
      coverage: w.coverage ?? 'unknown',
      stats_json: safeStatsJson(w.statsJson),
    }));

    try {
      await this.ch.getClient().insert({
        table: HF_WINDOWS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_WINDOWS_TABLE,
        result: 'success',
      });
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_WINDOWS_TABLE,
        result: 'error',
      });
      this.ch.markUnavailable((err as Error).message);
      this.logger.warn(`insertHfWindows failed: ${(err as Error).message}`);
    }
  }

  /** HF point count for a trip (idempotency / diagnostics). Degrades to 0. */
  async countTripHfPoints(vehicleId: string, tripId: string): Promise<number> {
    if (!this.ch.isAvailable) return 0;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
        `,
        query_params: { vehicleId, tripId },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0);
    } catch (err: unknown) {
      this.logger.warn(`countTripHfPoints failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** HF derived event count for a trip. Degrades to 0. */
  async countTripHfEvents(vehicleId: string, tripId: string): Promise<number> {
    if (!this.ch.isAvailable) return 0;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${HF_EVENTS_TABLE} FINAL
          WHERE vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
        `,
        query_params: { vehicleId, tripId },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0);
    } catch (err: unknown) {
      this.logger.warn(`countTripHfEvents failed: ${(err as Error).message}`);
      return 0;
    }
  }

  /** Latest mirrored HF timestamp for a trip (points or events). */
  async getTripLastEvidenceAt(
    vehicleId: string,
    tripId: string,
  ): Promise<string | null> {
    if (!this.ch.isAvailable) return null;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT max(ts) AS latest_at
          FROM (
            SELECT max(recorded_at) AS ts
            FROM ${HF_POINTS_TABLE}
            WHERE vehicle_id = {vehicleId: String}
              AND trip_id = {tripId: String}
            UNION ALL
            SELECT max(event_start) AS ts
            FROM ${HF_EVENTS_TABLE}
            WHERE vehicle_id = {vehicleId: String}
              AND trip_id = {tripId: String}
          )
        `,
        query_params: { vehicleId, tripId },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });
      const [row] = await result.json<{ latest_at: string | null }>();
      return parseChUtc(row?.latest_at);
    } catch (err: unknown) {
      this.logger.warn(`getTripLastEvidenceAt failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Read deduplicated HF windows for a trip. Degrades gracefully. */
  async getTripHfWindows(
    vehicleId: string,
    tripId: string,
  ): Promise<HfTripWindowsResult> {
    const base: HfTripWindowsResult = {
      available: false,
      tripId,
      vehicleId,
      windows: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    const rows = await this.ch.runGuardedAnalysisQuery(
      'hf_trip_windows',
      async () => {
        const result = await this.ch.getClient().query({
          query: `
          SELECT
            org_id,
            vehicle_id,
            trip_id,
            booking_id,
            window_start,
            window_end,
            signal_group,
            point_count,
            sample_interval_min_ms,
            sample_interval_max_ms,
            sample_interval_avg_ms,
            max_speed_kmh,
            max_accel_mps2,
            min_accel_mps2,
            max_traction_kw,
            min_traction_kw,
            soc_delta_pct,
            gps_point_count,
            missing_gap_count,
            largest_gap_ms,
            coverage,
            stats_json
          FROM ${HF_WINDOWS_TABLE} FINAL
          WHERE vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
          ORDER BY window_start, signal_group
        `,
          query_params: { vehicleId, tripId },
          format: 'JSONEachRow',
          clickhouse_settings: { max_execution_time: 10 },
        });
        return result.json<{
          org_id: string;
          vehicle_id: string;
          trip_id: string | null;
          booking_id: string | null;
          window_start: string;
          window_end: string;
          signal_group: string;
          point_count: number;
          sample_interval_min_ms: number | null;
          sample_interval_max_ms: number | null;
          sample_interval_avg_ms: number | null;
          max_speed_kmh: number | null;
          max_accel_mps2: number | null;
          min_accel_mps2: number | null;
          max_traction_kw: number | null;
          min_traction_kw: number | null;
          soc_delta_pct: number | null;
          gps_point_count: number;
          missing_gap_count: number;
          largest_gap_ms: number | null;
          coverage: string | null;
          stats_json: string | null;
        }>();
      },
    );

    if (!rows) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_trip_windows',
        result: 'success',
      });

      const windows: HfWindowSummary[] = rows.map((r) => ({
        orgId: r.org_id,
        vehicleId: r.vehicle_id,
        tripId: r.trip_id,
        bookingId: r.booking_id,
        windowStart: parseChDate(r.window_start),
        windowEnd: parseChDate(r.window_end),
        signalGroup: r.signal_group as HfWindowSummary['signalGroup'],
        pointCount: Number(r.point_count ?? 0),
        sampleIntervalMinMs: r.sample_interval_min_ms,
        sampleIntervalMaxMs: r.sample_interval_max_ms,
        sampleIntervalAvgMs: r.sample_interval_avg_ms,
        maxSpeedKmh: r.max_speed_kmh,
        maxAccelMps2: r.max_accel_mps2,
        minAccelMps2: r.min_accel_mps2,
        maxTractionKw: r.max_traction_kw,
        minTractionKw: r.min_traction_kw,
        socDeltaPct: r.soc_delta_pct,
        gpsPointCount: Number(r.gps_point_count ?? 0),
        missingGapCount: Number(r.missing_gap_count ?? 0),
        largestGapMs: r.largest_gap_ms,
        coverage: (r.coverage as HfWindowSummary['coverage']) ?? 'unknown',
        statsJson: parseStatsJson(r.stats_json),
      }));

      return { ...base, available: true, windows };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_trip_windows',
        result: 'error',
      });
      this.logger.warn(`getTripHfWindows failed: ${(err as Error).message}`);
      return { ...base, degradedReason: (err as Error).message };
    }
  }

  /** HF availability summary for a vehicle/time-range. Degrades gracefully. */
  async getHfAvailability(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<HfAvailabilitySummary> {
    const base: HfAvailabilitySummary = {
      available: false,
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      pointCount: 0,
      earliestPointAt: null,
      latestPointAt: null,
      signalGroups: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            count()                  AS point_count,
            min(recorded_at)         AS earliest_point_at,
            max(recorded_at)         AS latest_point_at,
            groupUniqArray(signal_group) AS signal_groups
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
        `,
        query_params: {
          vehicleId,
          from: toChDateTimeParam(from),
          to: toChDateTimeParam(to),
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });

      const [row] = await result.json<{
        point_count: number;
        earliest_point_at: string | null;
        latest_point_at: string | null;
        signal_groups: string[];
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_availability',
        result: 'success',
      });

      return {
        ...base,
        available: true,
        pointCount: Number(row?.point_count ?? 0),
        earliestPointAt: parseChUtc(row?.earliest_point_at),
        latestPointAt: parseChUtc(row?.latest_point_at),
        signalGroups: Array.isArray(row?.signal_groups) ? row.signal_groups : [],
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_availability',
        result: 'error',
      });
      this.logger.warn(`getHfAvailability failed: ${(err as Error).message}`);
      return { ...base, degradedReason: (err as Error).message };
    }
  }

  /** Per-signal frequency summary for a vehicle/time-range. Degrades gracefully. */
  async getSignalFrequencySummary(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<HfSignalFrequencySummary> {
    const base: HfSignalFrequencySummary = {
      available: false,
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      signals: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            signal_name                                   AS signal_name,
            any(signal_group)                             AS signal_group,
            count()                                       AS point_count,
            min(recorded_at)                              AS first_seen_at,
            max(recorded_at)                              AS last_seen_at,
            (toUnixTimestamp64Milli(max(recorded_at)) - toUnixTimestamp64Milli(min(recorded_at)))
              / nullIf(count() - 1, 0)                    AS avg_interval_ms
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
          GROUP BY signal_name
          ORDER BY signal_name
        `,
        query_params: {
          vehicleId,
          from: toChDateTimeParam(from),
          to: toChDateTimeParam(to),
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });

      const rows = await result.json<{
        signal_name: string;
        signal_group: string;
        point_count: number;
        first_seen_at: string | null;
        last_seen_at: string | null;
        avg_interval_ms: number | null;
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_signal_frequency',
        result: 'success',
      });

      const signals: HfSignalFrequencyRow[] = rows.map((r) => ({
        signalName: r.signal_name,
        signalGroup: r.signal_group,
        pointCount: Number(r.point_count ?? 0),
        firstSeenAt: parseChUtc(r.first_seen_at),
        lastSeenAt: parseChUtc(r.last_seen_at),
        avgIntervalMs:
          r.avg_interval_ms == null ? null : Number(r.avg_interval_ms),
      }));

      return { ...base, available: true, signals };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_signal_frequency',
        result: 'error',
      });
      this.logger.warn(
        `getSignalFrequencySummary failed: ${(err as Error).message}`,
      );
      return { ...base, degradedReason: (err as Error).message };
    }
  }

  /**
   * Bounded HF scalar points for VSI cadence analysis (best-effort).
   * Does not assert native device sampling frequency — bucket timestamps only.
   */
  async getBoundedSignalValuePoints(input: {
    vehicleId: string;
    signalName: string;
    from: Date;
    to: Date;
    limit: number;
  }): Promise<{
    status: 'SUCCESS' | 'UNAVAILABLE' | 'QUERY_FAILED' | 'EMPTY';
    points: Array<{ recordedAtMs: number; value: number }>;
  }> {
    if (!this.ch.isAvailable) {
      return { status: 'UNAVAILABLE', points: [] };
    }
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            recorded_at AS recorded_at,
            value_float AS value_float
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND signal_name = {signalName: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
            AND value_float IS NOT NULL
          ORDER BY recorded_at DESC
          LIMIT {limit: UInt32}
        `,
        query_params: {
          vehicleId: input.vehicleId,
          signalName: input.signalName,
          from: toChDateTimeParam(input.from),
          to: toChDateTimeParam(input.to),
          limit: input.limit,
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 15 },
      });
      const rows = await result.json<{
        recorded_at: string;
        value_float: number | string;
      }>();
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_bounded_signal_points',
        result: 'success',
      });
      const points = rows
        .map((r) => {
          const iso = parseChUtc(r.recorded_at);
          const value = Number(r.value_float);
          if (!iso || !Number.isFinite(value)) {
            return null;
          }
          return { recordedAtMs: new Date(iso).getTime(), value };
        })
        .filter((r): r is { recordedAtMs: number; value: number } => r != null)
        .sort((a, b) => a.recordedAtMs - b.recordedAtMs);
      return {
        status: points.length > 0 ? 'SUCCESS' : 'EMPTY',
        points,
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_bounded_signal_points',
        result: 'error',
      });
      this.logger.warn(
        `getBoundedSignalValuePoints failed: ${(err as Error).message}`,
      );
      return { status: 'QUERY_FAILED', points: [] };
    }
  }

  /**
   * Trip-scoped RPM HF points (strict org/vehicle/trip/signal filters + trip time window).
   * Never assigns points from overlapping vehicle windows alone.
   */
  async getTripRpmHfPoints(input: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    tripStart: Date;
    tripEnd: Date;
    signalName?: string;
    limit?: number;
    offset?: number;
  }): Promise<HfTripRpmPointsReadResult> {
    const signalName = input.signalName ?? HF_ENGINE_RPM_SIGNAL_NAME;
    const limit = input.limit ?? HF_TRIP_RPM_DEFAULT_READ_LIMIT;
    const offset = input.offset ?? 0;
    const base: HfTripRpmPointsReadResult = {
      status: 'UNAVAILABLE',
      available: false,
      orgId: input.orgId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      tripWindowFromIso: input.tripStart.toISOString(),
      tripWindowToIso: input.tripEnd.toISOString(),
      signalName,
      points: [],
      totalMatchingCount: 0,
      returnedCount: 0,
      rawRowsReturned: 0,
      limit,
      offset,
      completenessStatus: 'EMPTY',
      duplicateTimestampCount: 0,
      invalidValueCount: 0,
      tenantScopeViolation: false,
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    const fromMs = input.tripStart.getTime();
    const toMs = input.tripEnd.getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      return {
        ...base,
        status: 'QUERY_FAILED',
        degradedReason: 'invalid_trip_window',
      };
    }

    try {
      const countResult = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${HF_POINTS_TABLE}
          WHERE org_id = {orgId: String}
            AND vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
            AND signal_name = {signalName: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
        `,
        query_params: {
          orgId: input.orgId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          signalName,
          from: toChDateTimeParam(input.tripStart),
          to: toChDateTimeParam(input.tripEnd),
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 15 },
      });
      const [countRow] = await countResult.json<{ cnt: string | number }>();
      const totalMatchingCount = Number(countRow?.cnt ?? 0);

      if (totalMatchingCount === 0) {
        this.metrics?.clickHouseAnalyticsQueries.inc({
          query: 'hf_trip_rpm_points',
          result: 'success',
        });
        return {
          ...base,
          status: 'EMPTY',
          available: true,
          totalMatchingCount: 0,
          completenessStatus: 'EMPTY',
        };
      }

      const result = await this.ch.getClient().query({
        query: `
          SELECT
            org_id,
            vehicle_id,
            trip_id,
            token_id,
            recorded_at,
            value_float,
            unit,
            quality
          FROM ${HF_POINTS_TABLE}
          WHERE org_id = {orgId: String}
            AND vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
            AND signal_name = {signalName: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
          ORDER BY recorded_at ASC, ingested_at ASC, value_float ASC
          LIMIT {limit: UInt32}
          OFFSET {offset: UInt32}
        `,
        query_params: {
          orgId: input.orgId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          signalName,
          from: toChDateTimeParam(input.tripStart),
          to: toChDateTimeParam(input.tripEnd),
          limit,
          offset,
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 15 },
      });

      const rows = await result.json<{
        org_id: string;
        vehicle_id: string;
        trip_id: string | null;
        token_id: string | number | null;
        recorded_at: string;
        value_float: number | string | null;
        unit: string | null;
        quality: string;
      }>();

      const rawRowsReturned = rows.length;

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_trip_rpm_points',
        result: 'success',
      });

      for (const r of rows) {
        if (
          r.org_id !== input.orgId ||
          r.vehicle_id !== input.vehicleId ||
          r.trip_id == null ||
          r.trip_id !== input.tripId
        ) {
          return {
            ...base,
            status: 'TENANT_SCOPE_VIOLATION',
            available: true,
            points: [],
            totalMatchingCount,
            returnedCount: 0,
            rawRowsReturned,
            completenessStatus: 'COMPLETE',
            duplicateTimestampCount: 0,
            invalidValueCount: 0,
            tenantScopeViolation: true,
            degradedReason: 'tenant_scope_violation',
          };
        }
      }

      let invalidValueCount = 0;
      const seenTimestamps = new Map<number, number>();
      const points: HfTripRpmPointRow[] = [];

      for (const r of rows) {
        const iso = parseChUtc(r.recorded_at);
        if (!iso) {
          invalidValueCount += 1;
          continue;
        }
        const recordedAtMs = new Date(iso).getTime();
        const valueRpm = parseHfRpmValueFloat(r.value_float);
        if (valueRpm === null) {
          invalidValueCount += 1;
          continue;
        }
        seenTimestamps.set(recordedAtMs, (seenTimestamps.get(recordedAtMs) ?? 0) + 1);
        const tokenRaw = r.token_id;
        const tokenId =
          tokenRaw == null || tokenRaw === ''
            ? null
            : Number(tokenRaw);
        points.push({
          recordedAtMs,
          recordedAtIso: iso,
          valueRpm,
          unit: r.unit ?? null,
          quality: r.quality ?? 'raw',
          orgId: r.org_id,
          vehicleId: r.vehicle_id,
          tripId: r.trip_id!,
          tokenId: tokenId != null && Number.isFinite(tokenId) ? tokenId : null,
        });
      }

      let duplicateTimestampCount = 0;
      for (const c of seenTimestamps.values()) {
        if (c > 1) {
          duplicateTimestampCount += c - 1;
        }
      }

      const completenessStatus: HfTripRpmPointsCompletenessStatus =
        totalMatchingCount > offset + rawRowsReturned
          ? 'INCOMPLETE_MORE_POINTS_AVAILABLE'
          : 'COMPLETE';

      return {
        ...base,
        status: 'SUCCESS',
        available: true,
        points,
        totalMatchingCount,
        returnedCount: points.length,
        rawRowsReturned,
        completenessStatus,
        duplicateTimestampCount,
        invalidValueCount,
        tenantScopeViolation: false,
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_trip_rpm_points',
        result: 'error',
      });
      this.logger.warn(`getTripRpmHfPoints failed: ${(err as Error).message}`);
      return {
        ...base,
        status: 'QUERY_FAILED',
        degradedReason: (err as Error).message,
      };
    }
  }

  /** Recent derived HF events for a vehicle/time-range. Degrades gracefully. */
  async getRecentHfEvents(
    vehicleId: string,
    from: Date,
    to: Date,
    limit = 200,
  ): Promise<HfRecentEventsResult> {
    const base: HfRecentEventsResult = {
      available: false,
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      events: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            event_type    AS event_type,
            severity      AS severity,
            event_start   AS event_start,
            event_end     AS event_end,
            duration_ms   AS duration_ms,
            confidence    AS confidence,
            primary_value AS primary_value,
            primary_unit  AS primary_unit,
            trip_id       AS trip_id,
            booking_id    AS booking_id
          FROM ${HF_EVENTS_TABLE} FINAL
          WHERE vehicle_id = {vehicleId: String}
            AND event_start >= parseDateTime64BestEffort({from: String})
            AND event_start <= parseDateTime64BestEffort({to: String})
          ORDER BY event_start DESC
          LIMIT {limit: UInt32}
        `,
        query_params: {
          vehicleId,
          from: toChDateTimeParam(from),
          to: toChDateTimeParam(to),
          limit,
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });

      const rows = await result.json<{
        event_type: string;
        severity: string;
        event_start: string;
        event_end: string | null;
        duration_ms: number | null;
        confidence: string;
        primary_value: number | null;
        primary_unit: string | null;
        trip_id: string | null;
        booking_id: string | null;
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_recent_events',
        result: 'success',
      });

      const events: HfEventRow[] = rows.map((r) => ({
        eventType: r.event_type,
        severity: r.severity,
        eventStart: parseChUtc(r.event_start) ?? r.event_start,
        eventEnd: parseChUtc(r.event_end),
        durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
        confidence: r.confidence,
        primaryValue: r.primary_value == null ? null : Number(r.primary_value),
        primaryUnit: r.primary_unit ?? null,
        tripId: r.trip_id ?? null,
        bookingId: r.booking_id ?? null,
      }));

      return { ...base, available: true, events };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_recent_events',
        result: 'error',
      });
      this.logger.warn(`getRecentHfEvents failed: ${(err as Error).message}`);
      return { ...base, degradedReason: (err as Error).message };
    }
  }
}

function parseChDate(value: string): Date {
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? new Date(value) : d;
}

function safeStatsJson(value: HfWindowSummary['statsJson']): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function parseStatsJson(raw: string | null | undefined): HfWindowSummary['statsJson'] {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as HfWindowSummary['statsJson'];
  } catch {
    return undefined;
  }
}
