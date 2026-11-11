#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  buildLegacyDescriptiveStats,
  buildV1bResearchRpmReport,
} from './dbi-p2d2d-rpm-reporting-lib.mjs';

const require = createRequire('/opt/synqdrive/current/backend/package.json');
const pg = require('pg');

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const WIN_START = '2026-10-28T00:00:00.000Z';
const WIN_END = '2026-11-11T00:00:00.000Z';
const BASELINE = {
  AUDI_A4: '2ced563c-732b-464d-b6e0-14a5228dd0f4',
  VW_TIGUAN: 'e7873ead-35b7-494a-8d91-c5e41034e81b',
};
const VEH = {
  AUDI_A4: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
  VW_TIGUAN: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
};
const OUT = process.env.P2D2D_OUT || '/tmp/p2d2d-out';
const MAX_STMT = 40;

function dig(v) {
  return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 20);
}

function scoreTrip(row) {
  const cov = Number(row.coverage_ratio) || 0;
  const pts = Number(row.valid_points) || 0;
  const dist = Number(row.distance_km) || 0;
  const dur = Number(row.duration_minutes) || 0;
  const evAcc = Number(row.event_accepted) || 0;
  const evSus = Number(row.event_suspect) || 0;
  if (row.v1b_outcome !== 'SUCCEEDED' || row.motion_status !== 'SUCCEEDED') return -1e9;
  if (dist <= 0 || dur < 3) return -1e8;
  // Trip selection heuristic — density is not RPM quality or poll success.
  let s = pts * 10 + dist * 20 + dur * 5 + cov * 200 + evAcc * 50 - evSus * 30;
  return s;
}

function analyzeRpmFromSummaryPair(legacySummary, tierAwareSummary) {
  const legacy = legacySummary ?? {};
  const descriptive = buildLegacyDescriptiveStats(legacy);
  const researchRpmReport = buildV1bResearchRpmReport({
    legacy,
    tierAware: tierAwareSummary ?? null,
    telemetrySourceFamily: 'RUPTELA_R1',
  });
  const rv = legacy.rpmValues ?? {};
  const tc = legacy.temporalCoverage ?? {};
  return {
    ...descriptive,
    rpmMin: rv.rpmMin ?? null,
    rpmMedian: rv.rpmMedian ?? null,
    rpmMax: rv.rpmMax ?? null,
    eligibleBuckets: tc.eligibleOneSecondBuckets ?? null,
    observedUniqueBuckets: tc.observedUniqueOneSecondBuckets ?? null,
    /** Preserved legacy numeric; interpret via researchRpmReport only. */
    observedBucketCoverageRatio: tc.observedBucketCoverageRatio ?? null,
    researchRpmReport,
  };
}

function sanitizeEvent(e) {
  return {
    kind: e.kind,
    quality: e.quality,
    flags: Array.isArray(e.flags) ? e.flags.slice(0, 12) : e.flags,
    startSpeedKmh: e.startSpeedKmh,
    endSpeedKmh: e.endSpeedKmh,
    deltaKmh: e.deltaKmh,
    startLabel: e.startLabel,
    endLabel: e.endLabel,
    intensity: e.intensity ?? null,
    artefactSuspect: (e.flags ?? []).some((f) => String(f).includes('SUSPECT') || String(f).includes('ARTEFACT')),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  try {
    copyFileSync(
      '/opt/cursor/artifacts/dbi-p2d2c-extraction-report.json',
      `${OUT}/p2d2c-baseline-manifest-preserved.json`,
    );
  } catch {
    /* local-only run */
  }

  let stmt = 0;
  const client = new pg.Client({ user: 'postgres', database: 'synqdrive', host: '/var/run/postgresql' });
  await client.connect();
  const q = async (text, params) => {
    if (++stmt > MAX_STMT) throw new Error('BUDGET');
    return client.query(text, params);
  };

  const result = {
    operation: 'DBI_P2D2D_REAL_DATA_DOMAIN_ANALYSIS',
    baselinePreserved: BASELINE,
    vehicles: {},
  };

  try {
    await q('BEGIN');
    await q('SET TRANSACTION READ ONLY');
    await q("SET LOCAL statement_timeout = '12s'");

    for (const [label, vehicleId] of Object.entries(VEH)) {
      const candidates = await q(
        `WITH trips AS (
          SELECT vt.id, vt.distance_km, vt.duration_minutes, vt.start_time, vt.end_time
          FROM vehicle_trips vt
          WHERE vt.vehicle_id = $1
            AND vt.trip_status = 'COMPLETED'
            AND vt.end_time >= $2::timestamptz AND vt.end_time < $3::timestamptz
            AND vt.end_time IS NOT NULL
            AND COALESCE(vt.distance_km, 0) > 0
            AND COALESCE(vt.duration_minutes, 0) >= 3
        )
        SELECT t.id AS trip_id, t.distance_km, t.duration_minutes, t.start_time, t.end_time,
               v1b.summary_json->>'processingOutcome' AS v1b_outcome,
               (v1b.summary_json->'rpmValues'->>'validPointCount')::int AS valid_points,
               (v1b.summary_json->'temporalCoverage'->>'observedBucketCoverageRatio')::float AS coverage_ratio,
               mot.shadow_status AS motion_status,
               (mot.summary_json->>'eventAcceptedCount')::int AS event_accepted,
               (mot.summary_json->>'eventArtefactSuspectCount')::int AS event_suspect
        FROM trips t
        INNER JOIN LATERAL (
          SELECT * FROM ds4_rpm_hf_v1b_shadow_runs_v1 r
          WHERE r.organization_id = $4 AND r.trip_id = t.id
          ORDER BY r.computed_at DESC LIMIT 1
        ) v1b ON v1b.summary_json->>'processingOutcome' = 'SUCCEEDED'
        INNER JOIN LATERAL (
          SELECT * FROM di_v0_motion_core_shadow_runs_v1 m
          WHERE m.organization_id = $4 AND m.trip_id = t.id
          ORDER BY m.created_at DESC LIMIT 1
        ) mot ON mot.shadow_status = 'SUCCEEDED'
        ORDER BY coverage_ratio DESC NULLS LAST, valid_points DESC NULLS LAST
        LIMIT 25`,
        [vehicleId, WIN_START, WIN_END, ORG],
      );

      const ranked = candidates.rows
        .map((r) => ({ ...r, score: scoreTrip(r) }))
        .sort((a, b) => b.score - a.score);

      let selected = ranked[0] ?? null;
      const baselineId = BASELINE[label];
      const baselineRow = ranked.find((r) => r.trip_id === baselineId);
      if (!selected || selected.score < 0) {
        selected = baselineRow || candidates.rows[0] || { trip_id: baselineId };
        result.vehicles[label] = { selectedTripId: baselineId, selectionReason: 'NO_IMPROVED_CANDIDATE_RETAIN_BASELINE' };
        continue;
      }

      let selectedTripId = selected.trip_id;
      let selectionReason = 'IMPROVED_BY_POINTS_DISTANCE_DURATION';
      const baselineScore = baselineRow ? scoreTrip(baselineRow) : -1e9;
      if (selectedTripId === baselineId) selectionReason = 'BASELINE_STILL_BEST_OR_TIED';
      else if (baselineScore >= selected.score) {
        selectedTripId = baselineId;
        selectionReason = 'NO_IMPROVED_TRIP_BASELINE_RETAINED';
      }

      const v1bLegacy = await q(
        `SELECT summary_json FROM ds4_rpm_hf_v1b_shadow_runs_v1
         WHERE organization_id=$1 AND vehicle_id=$2 AND trip_id=$3
           AND engine_version = 'ds4-rpm-hf-v1b-engine-v1'
         ORDER BY computed_at DESC LIMIT 1`,
        [ORG, vehicleId, selectedTripId],
      );
      const v1bTier = await q(
        `SELECT summary_json FROM ds4_rpm_hf_v1b_shadow_runs_v1
         WHERE organization_id=$1 AND vehicle_id=$2 AND trip_id=$3
           AND engine_version = 'ds4-rpm-hf-v1b-engine-v1-tier-aware'
         ORDER BY computed_at DESC LIMIT 1`,
        [ORG, vehicleId, selectedTripId],
      );
      const mot = await q(
        `SELECT id, summary_json, payload_gzip, uncompressed_bytes FROM di_v0_motion_core_shadow_runs_v1
         WHERE organization_id=$1 AND vehicle_id=$2 AND trip_id=$3
         ORDER BY created_at DESC LIMIT 1`,
        [ORG, vehicleId, selectedTripId],
      );

      const legacySummary = v1bLegacy.rows[0]?.summary_json ?? {};
      const tierSummary = v1bTier.rows[0]?.summary_json ?? null;
      const rpm = analyzeRpmFromSummaryPair(legacySummary, tierSummary);

      let ds4Events = [];
      let ds4PayloadNote = 'NO_PAYLOAD';
      if (mot.rows[0]?.payload_gzip) {
        try {
          const decoded = JSON.parse(gunzipSync(mot.rows[0].payload_gzip).toString('utf8'));
          const events = Array.isArray(decoded.events) ? decoded.events : [];
          ds4Events = events.map(sanitizeEvent);
          ds4PayloadNote = 'PAYLOAD_GZIP_DECODED_EVENTS_ONLY';
        } catch {
          ds4PayloadNote = 'PAYLOAD_DECODE_FAILED';
        }
      }

      const msum = mot.rows[0]?.summary_json ?? {};
      const assess = await q(
        `SELECT assessment_status, evidence_quality, completeness_json, reason_codes
         FROM di_v0_ds4_trip_assessment_v1 WHERE organization_id=$1 AND trip_id=$2 ORDER BY computed_at DESC LIMIT 1`,
        [ORG, selectedTripId],
      );

      let baselineRpm = null;
      if (selectedTripId !== baselineId) {
        const bl = await q(
          `SELECT summary_json FROM ds4_rpm_hf_v1b_shadow_runs_v1
           WHERE organization_id=$1 AND trip_id=$2 AND engine_version = 'ds4-rpm-hf-v1b-engine-v1'
           ORDER BY computed_at DESC LIMIT 1`,
          [ORG, baselineId],
        );
        const bt = await q(
          `SELECT summary_json FROM ds4_rpm_hf_v1b_shadow_runs_v1
           WHERE organization_id=$1 AND trip_id=$2 AND engine_version = 'ds4-rpm-hf-v1b-engine-v1-tier-aware'
           ORDER BY computed_at DESC LIMIT 1`,
          [ORG, baselineId],
        );
        if (bl.rows[0]?.summary_json) {
          baselineRpm = analyzeRpmFromSummaryPair(bl.rows[0].summary_json, bt.rows[0]?.summary_json ?? null);
        }
      } else {
        baselineRpm = rpm;
      }

      const pack = {
        selectedTripId,
        selectionReason,
        candidateCount: ranked.length,
        topCandidates: ranked.slice(0, 5).map((r) => ({
          tripId: r.trip_id,
          score: r.score,
          tripTimeObservationDensity: r.coverage_ratio,
          validPoints: r.valid_points,
          distanceKm: r.distance_km,
          durationMin: r.duration_minutes,
        })),
        trip: selected,
        rpm,
        ds4: {
          motionRunId: mot.rows[0]?.id,
          summary: msum,
          assessment: assess.rows[0] ?? null,
          events: ds4Events,
          acceptedCount: ds4Events.filter((e) => !e.artefactSuspect).length,
          suspectCount: ds4Events.filter((e) => e.artefactSuspect).length,
          payloadNote: ds4PayloadNote,
        },
        baselineComparison: {
          baselineTripId: baselineId,
          baselineTripTimeObservationDensity: baselineRpm?.tripTimeObservationDensity ?? null,
          selectedTripTimeObservationDensity: rpm.tripTimeObservationDensity,
          baselinePoints: baselineRpm?.observationCount ?? null,
          selectedPoints: rpm.observationCount,
          improved:
            selectedTripId !== baselineId &&
            Number(rpm.observationCount) > Number(baselineRpm?.observationCount ?? 0),
        },
      };

      result.vehicles[label] = pack;
      writeFileSync(`${OUT}/${label}_${selectedTripId}.json`, JSON.stringify(pack, null, 2));
    }

    await q('COMMIT');
    result.queryCount = stmt;
    writeFileSync(`${OUT}/p2d2d-domain-analysis.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('FAIL', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
