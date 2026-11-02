import { createHash } from 'crypto';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
} from './ds4-layer2-p2-pinned-11.attestation.v1';
import {
  DS4_LAYER2_P4B_EVENT_KINEMATICS_EVIDENCE_SCHEMA_VERSION_V1,
  DS4_LAYER2_P4B_SIDEcar_ARTIFACT_FILES_V1,
  type Ds4Layer2P4bEventSpeedEvidenceRowV1,
  type Ds4Layer2P4bEvidenceClassV1,
  type Ds4Layer2P4bJoinExclusionRowV1,
  type Ds4Layer2P4bP2AdmissibleEventRowV1,
} from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import {
  detectDuplicateP4bJoinKeysV1,
  joinDs4Layer2P4bP2EventToMotionPayloadV1,
} from './ds4-layer2-p4b-event-join.v1';
import { computeDs4Layer2P4bInWindowSpeedEvidenceV1 } from './ds4-layer2-p4b-in-window-speed.v1';
import {
  DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
} from './ds4-layer2-p4b-pinned-source-runs.v1';
import type {
  Ds4Layer2P4bMotionPayloadLoaderV1,
  Ds4Layer2P4bPayloadLoadResultV1,
} from './ds4-layer2-p4b-payload-loader.v1';

function jsonReasons(reasons: readonly string[]): string {
  return JSON.stringify(reasons);
}

function boundaryClass(start: number | null, end: number | null): Ds4Layer2P4bEvidenceClassV1 {
  if (start != null && end != null && Number.isFinite(start) && Number.isFinite(end)) {
    return 'PERSISTED_BOUNDARY';
  }
  return 'UNAVAILABLE';
}

function windowClass(input: {
  limitations: readonly string[];
  sampleCount: number | null;
}): Ds4Layer2P4bEvidenceClassV1 {
  if (input.sampleCount != null && input.sampleCount > 0 && input.limitations.every((l) => l !== 'NO_NUMERIC_SPEED_IN_WINDOW')) {
    return 'DERIVED_IN_WINDOW';
  }
  return 'UNAVAILABLE';
}

export async function buildDs4Layer2P4bEventKinematicsEvidenceV1(input: {
  organizationId: string;
  admissibleEvents: readonly Ds4Layer2P4bP2AdmissibleEventRowV1[];
  payloadLoader: Ds4Layer2P4bMotionPayloadLoaderV1;
}): Promise<{
  evidenceRows: Ds4Layer2P4bEventSpeedEvidenceRowV1[];
  joinExclusions: Ds4Layer2P4bJoinExclusionRowV1[];
  summary: Record<string, unknown>;
}> {
  const joinExclusions: Ds4Layer2P4bJoinExclusionRowV1[] = [...detectDuplicateP4bJoinKeysV1(input.admissibleEvents)];
  const duplicateKeys = new Set(
    joinExclusions.filter((e) => e.failureReason === 'DUPLICATE_EVENT_INDEX').map((e) => `${e.tripId}|${e.sourceMotionRunId}|${e.eventIndex}`),
  );

  const payloadCache = new Map<string, Ds4Layer2P4bPayloadLoadResultV1>();
  const evidenceRows: Ds4Layer2P4bEventSpeedEvidenceRowV1[] = [];

  async function loadForTrip(tripId: string, sourceMotionRunId: string) {
    const cacheKey = `${tripId}|${sourceMotionRunId}`;
    if (payloadCache.has(cacheKey)) return payloadCache.get(cacheKey)!;
    const pinned =
      DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[
        tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number]
      ];
    const result = await input.payloadLoader.loadPinnedMotionPayload({
      organizationId: input.organizationId,
      tripId,
      sourceMotionRunId,
      expectedContentFingerprint: pinned.contentFingerprint,
    });
    payloadCache.set(cacheKey, result);
    return result;
  }

  for (const p2Event of input.admissibleEvents) {
    const joinKey = `${p2Event.tripId}|${p2Event.sourceMotionRunId}|${p2Event.eventIndex}`;
    if (duplicateKeys.has(joinKey)) continue;

    const pinned =
      DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[
        p2Event.tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number]
      ];
    if (p2Event.sourceMotionRunId !== pinned.sourceMotionRunId) {
      joinExclusions.push({
        tripId: p2Event.tripId,
        sourceMotionRunId: p2Event.sourceMotionRunId,
        eventIndex: p2Event.eventIndex,
        offlineReconstructionKey: p2Event.offlineReconstructionKey,
        failureReason: 'SOURCE_RUN_MISMATCH',
        detail: 'P2 source run != pinned table',
      });
      continue;
    }

    const loadResult = await loadForTrip(p2Event.tripId, p2Event.sourceMotionRunId);
    if (!loadResult.ok) {
      joinExclusions.push({
        tripId: p2Event.tripId,
        sourceMotionRunId: p2Event.sourceMotionRunId,
        eventIndex: p2Event.eventIndex,
        offlineReconstructionKey: p2Event.offlineReconstructionKey,
        failureReason: loadResult.reason,
        detail: loadResult.detail,
      });
      continue;
    }

    const joined = joinDs4Layer2P4bP2EventToMotionPayloadV1({
      p2Event,
      loaded: loadResult.loaded,
    });
    if (!joined.ok) {
      joinExclusions.push(joined.exclusion);
      continue;
    }

    const { motionEvent, loaded } = joined.join;
    const window = computeDs4Layer2P4bInWindowSpeedEvidenceV1({
      payload: loaded.payload,
      startLabel: p2Event.startLabelUtc,
      endLabel: p2Event.endLabelUtc,
      durationTier: p2Event.durationTier,
      steps: p2Event.steps,
      coverageRatio: p2Event.coverageRatio,
    });

    const qualityLimitations: string[] = [];
    if (p2Event.durationTier === 'BIN_ONLY') {
      qualityLimitations.push('BIN_ONLY_SPARSE_SUPPORT');
    }

    evidenceRows.push({
      offlineReconstructionKey: p2Event.offlineReconstructionKey,
      tripId: p2Event.tripId,
      vehicleId: p2Event.vehicleId,
      sourceMotionRunId: p2Event.sourceMotionRunId,
      motionContentFingerprint: loaded.contentFingerprint,
      sourceMotionRevision: loaded.sourceMotionRevision,
      eventIndex: p2Event.eventIndex,
      eventKind: p2Event.eventKind,
      startLabelUtc: p2Event.startLabelUtc,
      endLabelUtc: p2Event.endLabelUtc,
      durationTier: p2Event.durationTier,
      eligibilityClassification: p2Event.eligibilityClassification,
      p2SpeedAuthority: p2Event.speedAuthority,
      payloadSpeedAuthority: loaded.speedAuthority,
      startSpeedKmh: motionEvent.startSpeedKmh,
      endSpeedKmh: motionEvent.endSpeedKmh,
      boundaryEvidenceClass: boundaryClass(motionEvent.startSpeedKmh, motionEvent.endSpeedKmh),
      windowMinSpeedKmh: window.windowMinSpeedKmh,
      windowMaxSpeedKmh: window.windowMaxSpeedKmh,
      windowMeanSpeedKmh: window.windowMeanSpeedKmh,
      windowSampleCount: window.windowSampleCount,
      windowExpectedSampleCount: window.windowExpectedSampleCount,
      windowCoverageRatio: window.windowCoverageRatio,
      windowEvidenceClass: windowClass({
        limitations: window.limitations,
        sampleCount: window.windowSampleCount,
      }),
      windowLimitationReasonsJson: jsonReasons(window.limitations),
      repairInfluenced: window.repairInfluenced,
      peakAccelMps2: null,
      peakEvidenceStatus: 'UNAVAILABLE',
      peakUnavailabilityReason: 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT',
      qualityLimitationReasonsJson: jsonReasons(qualityLimitations),
    });
  }

  const summary = summarizeP4bCoverageV1({
    admissibleEventCount: input.admissibleEvents.length,
    evidenceRows,
    joinExclusions,
  });

  return { evidenceRows, joinExclusions, summary };
}

function summarizeP4bCoverageV1(input: {
  admissibleEventCount: number;
  evidenceRows: readonly Ds4Layer2P4bEventSpeedEvidenceRowV1[];
  joinExclusions: readonly Ds4Layer2P4bJoinExclusionRowV1[];
}): Record<string, unknown> {
  const byVehicle: Record<string, { exactJoins: number; failed: number }> = {};
  const bySourceFamily: Record<string, { exactJoins: number; failed: number }> = {};
  const bySpeedAuthority: Record<string, { exactJoins: number; failed: number }> = {};
  let boundaryAvailable = 0;
  let windowDerived = 0;
  let binOnlyCount = 0;
  let repairInfluencedCount = 0;

  for (const row of input.evidenceRows) {
    if (row.boundaryEvidenceClass === 'PERSISTED_BOUNDARY') boundaryAvailable += 1;
    if (row.windowEvidenceClass === 'DERIVED_IN_WINDOW') windowDerived += 1;
    if (row.durationTier === 'BIN_ONLY') binOnlyCount += 1;
    if (row.repairInfluenced) repairInfluencedCount += 1;

    const vehicleBucket = (byVehicle[row.vehicleId] ??= { exactJoins: 0, failed: 0 });
    vehicleBucket.exactJoins += 1;

    const tripPinned =
      DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1[
        row.tripId as (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number]
      ];
    const familyBucket = (bySourceFamily[tripPinned.sourceFamily] ??= { exactJoins: 0, failed: 0 });
    familyBucket.exactJoins += 1;
    const auth = row.p2SpeedAuthority ?? 'UNKNOWN';
    const authBucket = (bySpeedAuthority[auth] ??= { exactJoins: 0, failed: 0 });
    authBucket.exactJoins += 1;
  }

  for (const ex of input.joinExclusions) {
    const vehicleId =
      input.evidenceRows.find((r) => r.tripId === ex.tripId)?.vehicleId ??
      'UNKNOWN_VEHICLE_FOR_FAILED_JOIN';
    const vehicleBucket = (byVehicle[vehicleId] ??= { exactJoins: 0, failed: 0 });
    vehicleBucket.failed += 1;
  }

  return {
    admissibleP2EventCount: input.admissibleEventCount,
    expectedAdmissibleEventCount: DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
    exactJoinCount: input.evidenceRows.length,
    failedJoinCount: input.joinExclusions.length,
    eventsAccounted: input.evidenceRows.length + input.joinExclusions.length,
    boundarySpeedCoverage: {
      persistedBoundaryCount: boundaryAvailable,
      ratio: input.evidenceRows.length > 0 ? boundaryAvailable / input.evidenceRows.length : 0,
    },
    windowSpeedCoverage: {
      derivedInWindowCount: windowDerived,
      ratio: input.evidenceRows.length > 0 ? windowDerived / input.evidenceRows.length : 0,
    },
    binOnlyEventCount: binOnlyCount,
    repairInfluencedEventCount: repairInfluencedCount,
    peakEvidenceStatus: 'UNAVAILABLE',
    peakUnavailabilityReason: 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT',
    coverageByVehicleId: byVehicle,
    coverageBySourceFamily: bySourceFamily,
    coverageByP2SpeedAuthority: bySpeedAuthority,
    joinFailureReasonCounts: input.joinExclusions.reduce<Record<string, number>>((acc, row) => {
      acc[row.failureReason] = (acc[row.failureReason] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return csvEscape(String(value));
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const EVIDENCE_CSV_COLUMNS = [
  'offline_reconstruction_key',
  'trip_id',
  'vehicle_id',
  'source_motion_run_id',
  'motion_content_fingerprint',
  'source_motion_revision',
  'event_index',
  'event_kind',
  'start_label_utc',
  'end_label_utc',
  'duration_tier',
  'eligibility_classification',
  'p2_speed_authority',
  'payload_speed_authority',
  'start_speed_kmh',
  'end_speed_kmh',
  'boundary_evidence_class',
  'window_min_speed_kmh',
  'window_max_speed_kmh',
  'window_mean_speed_kmh',
  'window_sample_count',
  'window_expected_sample_count',
  'window_coverage_ratio',
  'window_evidence_class',
  'window_limitation_reasons_json',
  'repair_influenced',
  'peak_accel_mps2',
  'peak_evidence_status',
  'peak_unavailability_reason',
  'quality_limitation_reasons_json',
] as const;

const EXCLUSION_CSV_COLUMNS = [
  'trip_id',
  'source_motion_run_id',
  'event_index',
  'offline_reconstruction_key',
  'failure_reason',
  'detail',
] as const;

export function buildDs4Layer2P4bSidecarArtifactsV1(input: {
  p4bEvaluationCodeSha: string;
  p2EvaluationCodeSha: string;
  p3cMergeShaReference: string;
  organizationId: string;
  builtAtUtc: Date;
  evidenceRows: readonly Ds4Layer2P4bEventSpeedEvidenceRowV1[];
  joinExclusions: readonly Ds4Layer2P4bJoinExclusionRowV1[];
  summary: Record<string, unknown>;
  pinnedSourceRuns: typeof DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1;
}): {
  manifest: Record<string, unknown>;
  eventSpeedEvidenceCsv: string;
  joinExclusionsCsv: string;
  coverageSummaryJson: string;
  fileChecksums: Record<string, string>;
} {
  const evidenceLines = [EVIDENCE_CSV_COLUMNS.join(',')];
  for (const row of input.evidenceRows) {
    const map: Record<string, unknown> = {
      offline_reconstruction_key: row.offlineReconstructionKey,
      trip_id: row.tripId,
      vehicle_id: row.vehicleId,
      source_motion_run_id: row.sourceMotionRunId,
      motion_content_fingerprint: row.motionContentFingerprint,
      source_motion_revision: row.sourceMotionRevision,
      event_index: row.eventIndex,
      event_kind: row.eventKind,
      start_label_utc: row.startLabelUtc,
      end_label_utc: row.endLabelUtc,
      duration_tier: row.durationTier,
      eligibility_classification: row.eligibilityClassification,
      p2_speed_authority: row.p2SpeedAuthority,
      payload_speed_authority: row.payloadSpeedAuthority,
      start_speed_kmh: row.startSpeedKmh,
      end_speed_kmh: row.endSpeedKmh,
      boundary_evidence_class: row.boundaryEvidenceClass,
      window_min_speed_kmh: row.windowMinSpeedKmh,
      window_max_speed_kmh: row.windowMaxSpeedKmh,
      window_mean_speed_kmh: row.windowMeanSpeedKmh,
      window_sample_count: row.windowSampleCount,
      window_expected_sample_count: row.windowExpectedSampleCount,
      window_coverage_ratio: row.windowCoverageRatio,
      window_evidence_class: row.windowEvidenceClass,
      window_limitation_reasons_json: row.windowLimitationReasonsJson,
      repair_influenced: row.repairInfluenced,
      peak_accel_mps2: row.peakAccelMps2,
      peak_evidence_status: row.peakEvidenceStatus,
      peak_unavailability_reason: row.peakUnavailabilityReason,
      quality_limitation_reasons_json: row.qualityLimitationReasonsJson,
    };
    evidenceLines.push(EVIDENCE_CSV_COLUMNS.map((c) => csvCell(map[c])).join(','));
  }
  const eventSpeedEvidenceCsv = `${evidenceLines.join('\n')}\n`;

  const exclusionLines = [EXCLUSION_CSV_COLUMNS.join(',')];
  for (const row of input.joinExclusions) {
    exclusionLines.push(
      [
        row.tripId,
        row.sourceMotionRunId,
        row.eventIndex,
        row.offlineReconstructionKey,
        row.failureReason,
        row.detail,
      ]
        .map((v) => csvCell(v))
        .join(','),
    );
  }
  const joinExclusionsCsv = `${exclusionLines.join('\n')}\n`;

  const coverageSummaryJson = `${JSON.stringify(input.summary, null, 2)}\n`;

  const fileChecksums: Record<string, string> = {
    'p4b_event_speed_evidence.csv': sha256Hex(eventSpeedEvidenceCsv),
    'p4b_join_exclusions.csv': sha256Hex(joinExclusionsCsv),
    'p4b_coverage_summary.json': sha256Hex(coverageSummaryJson),
  };

  const manifestWithoutSelf: Record<string, unknown> = {
    schemaVersion: DS4_LAYER2_P4B_EVENT_KINEMATICS_EVIDENCE_SCHEMA_VERSION_V1,
    builtAtUtc: input.builtAtUtc.toISOString(),
    organizationId: input.organizationId,
    p4bEvaluationCodeSha: input.p4bEvaluationCodeSha,
    p2EvaluationCodeSha: input.p2EvaluationCodeSha,
    p3cMergeShaReference: input.p3cMergeShaReference,
    p2InputChecksumsSha256: { ...DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1 },
    p2ManifestChecksumSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
    pinnedSourceMotionRuns: input.pinnedSourceRuns,
    kinematicInvariant: 'P2_CSV_UNMODIFIED_SIDEcar_ONLY',
    peakEvidencePolicy: 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT',
    summary: input.summary,
    artifactFiles: [...DS4_LAYER2_P4B_SIDEcar_ARTIFACT_FILES_V1],
    fileChecksumsSha256: fileChecksums,
  };

  const manifest = {
    ...manifestWithoutSelf,
    manifestChecksumSha256: sha256Hex(`${JSON.stringify(manifestWithoutSelf, null, 2)}\n`),
  };

  return {
    manifest,
    eventSpeedEvidenceCsv,
    joinExclusionsCsv,
    coverageSummaryJson,
    fileChecksums,
  };
}
