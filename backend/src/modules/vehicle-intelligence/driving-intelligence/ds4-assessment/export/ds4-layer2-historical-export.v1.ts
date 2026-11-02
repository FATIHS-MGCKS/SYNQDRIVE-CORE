import { createHash } from 'crypto';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import { DI_V0_DS4_ASSESSMENT_PROPOSED_COLLECTION_CUTOFF_UTC } from '../ds4-assessment.config';
import type { Ds4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality.v1';
import {
  coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1,
  projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1,
} from '../ds4-longitudinal-load-observables.v1';
import type { Ds4LongitudinalLoadObservablesV1 } from '../ds4-longitudinal-load-observables.v1.contract';
import type { Ds4SpeedAuthorityPartitionV1, Ds4TripAssessmentStatusV1 } from '../ds4-trip-assessment-v1.contract';
import {
  DS4_LAYER2_HISTORICAL_EXPORT_ARTIFACT_FILES_V1,
  DS4_LAYER2_HISTORICAL_EXPORT_CONTRACT_VERSIONS_V1,
  DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1,
  DS4_LAYER2_HISTORICAL_EXPORT_SCHEMA_VERSION_V1,
} from './ds4-layer2-historical-export.v1.contract';
import { assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1 } from './ds4-layer2-historical-export-event-summaries-integrity.v1';

export class Ds4Layer2HistoricalExportIntegrityErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ds4Layer2HistoricalExportIntegrityErrorV1';
  }
}

export type Ds4Layer2HistoricalExportMotionPinV1 = {
  motionRunId: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  shadowBundleVersion: string;
  contentFingerprint: string;
  workItemId: string;
  sourceFamily: string | null;
};

export type Ds4Layer2HistoricalExportAssessmentRowV1 = {
  assessmentId: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  assessmentVersion: string;
  assessmentStatus: Ds4TripAssessmentStatusV1;
  inputFingerprint: string;
  sourceMotionRunId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  eventRowContract: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  evidenceQuality: string | null;
  reasonCodes: unknown;
  computedAt: Date;
  eventSummariesJson: unknown;
  motionPin: Ds4Layer2HistoricalExportMotionPinV1;
  evidenceQualityContext: Ds4LongitudinalEvidenceQualityContextV1 | null;
  longitudinalLoad: Ds4LongitudinalLoadObservablesV1;
  eventIntensityRecords: readonly Ds4EventIntensityEligibilityRecordV1[];
};

export type Ds4Layer2HistoricalExportBuildInputV1 = {
  organizationId: string;
  evaluationCodeSha: string;
  exportedAt: Date;
  collectionCutoffUtc: string;
  sourceCollection: {
    table: 'di_v0_ds4_trip_assessment_v1';
    organizationScope: string;
    reconstructionMode: typeof DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1;
  };
  rows: readonly Ds4Layer2HistoricalExportAssessmentRowV1[];
};

export type Ds4Layer2HistoricalExportArtifactsV1 = {
  manifest: Record<string, unknown>;
  assessmentsCsv: string;
  longitudinalEventsCsv: string;
  exclusionsCsv: string;
  coverageSummary: Record<string, unknown>;
  fileChecksums: Record<string, string>;
};

export function assertMotionRunPinMatchesAssessmentV1(input: {
  assessment: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    sourceMotionRunId: string;
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
  };
  motion: Ds4Layer2HistoricalExportMotionPinV1;
}): void {
  const { assessment, motion } = input;
  if (motion.motionRunId !== assessment.sourceMotionRunId) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Motion run id mismatch for trip ${assessment.tripId}`,
    );
  }
  if (
    motion.organizationId !== assessment.organizationId ||
    motion.vehicleId !== assessment.vehicleId ||
    motion.tripId !== assessment.tripId
  ) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Motion scope mismatch for assessment sourceMotionRunId=${assessment.sourceMotionRunId}`,
    );
  }
  if (motion.pinnedSnapshotHash !== assessment.pinnedSnapshotHash) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Pinned snapshot hash mismatch for trip ${assessment.tripId}`,
    );
  }
  if (motion.combinedInputIdentity !== assessment.combinedInputIdentity) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Combined input identity mismatch for trip ${assessment.tripId}`,
    );
  }
}

export function buildAssessmentExportRowV1(input: {
  assessment: {
    id: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    assessmentVersion: string;
    assessmentStatus: string;
    inputFingerprint: string;
    sourceMotionRunId: string;
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
    eventRowContract: string | null;
    speedAuthority: string | null;
    evidenceQuality: string | null;
    reasonCodes: unknown;
    computedAt: Date;
    eventSummariesJson: unknown;
  };
  motionPin: Ds4Layer2HistoricalExportMotionPinV1;
  evidenceQualityContext: Ds4LongitudinalEvidenceQualityContextV1 | null;
}): Ds4Layer2HistoricalExportAssessmentRowV1 {
  assertMotionRunPinMatchesAssessmentV1({ assessment: input.assessment, motion: input.motionPin });
  assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
    assessmentId: input.assessment.id,
    eventRowContract: input.assessment.eventRowContract,
    eventSummariesJson: input.assessment.eventSummariesJson,
  });
  const speedAuthority = (input.assessment.speedAuthority ?? null) as Ds4SpeedAuthorityPartitionV1 | null;
  const eventSummaries = coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1(
    input.assessment.eventSummariesJson,
    speedAuthority,
  );
  const longitudinalLoad = projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1({
    assessmentStatus: input.assessment.assessmentStatus as Ds4TripAssessmentStatusV1,
    evidenceQuality: input.assessment.evidenceQuality,
    speedAuthority,
    eventSummariesJson: input.assessment.eventSummariesJson,
    evidenceQualityContext: input.evidenceQualityContext,
  });
  return {
    assessmentId: input.assessment.id,
    organizationId: input.assessment.organizationId,
    vehicleId: input.assessment.vehicleId,
    tripId: input.assessment.tripId,
    assessmentVersion: input.assessment.assessmentVersion,
    assessmentStatus: input.assessment.assessmentStatus as Ds4TripAssessmentStatusV1,
    inputFingerprint: input.assessment.inputFingerprint,
    sourceMotionRunId: input.assessment.sourceMotionRunId,
    pinnedSnapshotHash: input.assessment.pinnedSnapshotHash,
    combinedInputIdentity: input.assessment.combinedInputIdentity,
    eventRowContract: input.assessment.eventRowContract,
    speedAuthority,
    evidenceQuality: input.assessment.evidenceQuality,
    reasonCodes: input.assessment.reasonCodes,
    computedAt: input.assessment.computedAt,
    eventSummariesJson: input.assessment.eventSummariesJson,
    motionPin: input.motionPin,
    evidenceQualityContext: input.evidenceQualityContext,
    longitudinalLoad,
    eventIntensityRecords: eventSummaries.eventIntensityRecords,
  };
}

function stableSortRows(rows: readonly Ds4Layer2HistoricalExportAssessmentRowV1[]) {
  return [...rows].sort((a, b) => {
    const v = a.vehicleId.localeCompare(b.vehicleId);
    if (v !== 0) return v;
    const t = a.tripId.localeCompare(b.tripId);
    if (t !== 0) return t;
    return a.inputFingerprint.localeCompare(b.inputFingerprint);
  });
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return csvEscape(JSON.stringify(value));
  return csvEscape(String(value));
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function kindObservablesColumns(prefix: 'accel' | 'brake', kind: Ds4LongitudinalLoadObservablesV1['acceleration']) {
  return {
    [`${prefix}_admissible_event_count`]: kind.admissibleEventCount,
    [`${prefix}_full_count`]: kind.fullEventCount,
    [`${prefix}_bin_only_count`]: kind.binOnlyEventCount,
    [`${prefix}_B_k_mps`]: kind.specificLongitudinalImpulseMps,
    [`${prefix}_I_k_mps2`]: kind.normalizedMeanAccelMps2,
    [`${prefix}_Phi_k_per_min`]: kind.eventFrequencyPerMinute,
    [`${prefix}_Phi_d_per_km`]: kind.eventFrequencyPerKm,
    [`${prefix}_S_k`]: kind.maneuverTimeShare,
    [`${prefix}_intensity_median_full_mps2`]: kind.intensityMedianFullMps2,
    [`${prefix}_intensity_p90_full_mps2`]: kind.intensityP90FullMps2,
    [`${prefix}_intensity_max_admissible_mps2`]: kind.intensityMaxAdmissibleMps2,
  };
}

const ASSESSMENTS_CSV_COLUMNS = [
  'organization_id',
  'vehicle_id',
  'trip_id',
  'assessment_id',
  'assessment_version',
  'input_fingerprint',
  'source_motion_run_id',
  'pinned_snapshot_hash',
  'combined_input_identity',
  'event_row_contract',
  'shadow_bundle_version',
  'content_fingerprint',
  'source_family',
  'speed_authority',
  'assessment_status',
  'evidence_quality',
  'assessment_reason_codes_json',
  'layer2_reason_codes_json',
  'computed_at_utc',
  'exposure_seconds_Es',
  'distance_km_D',
  'exposure_coverage_ratio',
  'mean_moving_speed_kmh',
  'exposure_derivable',
  'exposure_provenance_version',
  ...Object.keys(kindObservablesColumns('accel', {} as Ds4LongitudinalLoadObservablesV1['acceleration'])),
  ...Object.keys(kindObservablesColumns('brake', {} as Ds4LongitudinalLoadObservablesV1['acceleration'])),
] as const;

const LONGITUDINAL_EVENTS_CSV_COLUMNS = [
  'assessment_id',
  'input_fingerprint',
  'trip_id',
  'source_motion_run_id',
  'event_index',
  'event_kind',
  'start_label_utc',
  'end_label_utc',
  'duration_s',
  'steps',
  'coverage_ratio',
  'duration_tier',
  'eligibility_classification',
  'mean_accel_mps2',
  'event_quality',
  'speed_authority',
  'start_uncertainty_s',
  'end_uncertainty_s',
  'reason_codes_json',
  'impulse_semantics_note',
] as const;

const EXCLUSIONS_CSV_COLUMNS = [
  'assessment_id',
  'input_fingerprint',
  'trip_id',
  'source_motion_run_id',
  'event_index',
  'event_kind',
  'eligibility_classification',
  'duration_tier',
  'event_quality',
  'mean_accel_mps2',
  'duration_s',
  'steps',
  'coverage_ratio',
  'missing_evidence_fields_json',
  'reason_codes_json',
  'null_intensity_semantics',
] as const;

function buildAssessmentsCsv(rows: readonly Ds4Layer2HistoricalExportAssessmentRowV1[]): string {
  const lines = [ASSESSMENTS_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const l2 = row.longitudinalLoad;
    const exposure = coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1(
      row.eventSummariesJson,
      row.speedAuthority,
    ).drivingExposure;
    const accel = kindObservablesColumns('accel', l2.acceleration);
    const brake = kindObservablesColumns('brake', l2.deceleration);
    const record: Record<string, unknown> = {
      organization_id: row.organizationId,
      vehicle_id: row.vehicleId,
      trip_id: row.tripId,
      assessment_id: row.assessmentId,
      assessment_version: row.assessmentVersion,
      input_fingerprint: row.inputFingerprint,
      source_motion_run_id: row.sourceMotionRunId,
      pinned_snapshot_hash: row.pinnedSnapshotHash,
      combined_input_identity: row.combinedInputIdentity,
      event_row_contract: row.eventRowContract,
      shadow_bundle_version: row.motionPin.shadowBundleVersion,
      content_fingerprint: row.motionPin.contentFingerprint,
      source_family: row.motionPin.sourceFamily,
      speed_authority: row.speedAuthority,
      assessment_status: row.assessmentStatus,
      evidence_quality: row.evidenceQuality,
      assessment_reason_codes_json: row.reasonCodes,
      layer2_reason_codes_json: l2.reasonCodes,
      computed_at_utc: row.computedAt,
      exposure_seconds_Es: l2.exposureSeconds,
      distance_km_D: l2.distanceKm,
      exposure_coverage_ratio: l2.exposureCoverageRatio,
      mean_moving_speed_kmh: l2.meanMovingSpeedKmh,
      exposure_derivable: exposure.derivable,
      exposure_provenance_version: exposure.provenance?.provenanceVersion ?? null,
      ...accel,
      ...brake,
    };
    lines.push(ASSESSMENTS_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function isExclusionRecord(record: Ds4EventIntensityEligibilityRecordV1): boolean {
  return record.classification === 'EXCLUDED_ARTEFACT' || record.classification === 'UNRATED';
}

function missingEvidenceFields(record: Ds4EventIntensityEligibilityRecordV1): string[] {
  const missing: string[] = [];
  if (record.meanAccelMps2 == null) missing.push('meanAccelMps2');
  if (record.durationS == null) missing.push('durationS');
  if (record.steps == null) missing.push('steps');
  if (record.coverageRatio == null) missing.push('coverageRatio');
  return missing;
}

function buildLongitudinalEventsCsv(rows: readonly Ds4Layer2HistoricalExportAssessmentRowV1[]): string {
  const lines = [LONGITUDINAL_EVENTS_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const sorted = [...row.eventIntensityRecords].sort((a, b) => a.eventIndex - b.eventIndex);
    for (const rec of sorted) {
      if (isExclusionRecord(rec)) continue;
      const record: Record<string, unknown> = {
        assessment_id: row.assessmentId,
        input_fingerprint: row.inputFingerprint,
        trip_id: row.tripId,
        source_motion_run_id: row.sourceMotionRunId,
        event_index: rec.eventIndex,
        event_kind: rec.kind,
        start_label_utc: rec.startLabel,
        end_label_utc: rec.endLabel,
        duration_s: rec.durationS,
        steps: rec.steps,
        coverage_ratio: rec.coverageRatio,
        duration_tier: rec.durationTier,
        eligibility_classification: rec.classification,
        mean_accel_mps2: rec.meanAccelMps2,
        event_quality: rec.eventQuality,
        speed_authority: rec.speedAuthority,
        start_uncertainty_s: rec.startUncertaintyS,
        end_uncertainty_s: rec.endUncertaintyS,
        reason_codes_json: rec.reasonCodes,
        impulse_semantics_note: 'persisted_event_intensity_record',
      };
      lines.push(LONGITUDINAL_EVENTS_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildExclusionsCsv(rows: readonly Ds4Layer2HistoricalExportAssessmentRowV1[]): string {
  const lines = [EXCLUSIONS_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const sorted = [...row.eventIntensityRecords].sort((a, b) => a.eventIndex - b.eventIndex);
    for (const rec of sorted) {
      if (!isExclusionRecord(rec)) continue;
      const record: Record<string, unknown> = {
        assessment_id: row.assessmentId,
        input_fingerprint: row.inputFingerprint,
        trip_id: row.tripId,
        source_motion_run_id: row.sourceMotionRunId,
        event_index: rec.eventIndex,
        event_kind: rec.kind,
        eligibility_classification: rec.classification,
        duration_tier: rec.durationTier,
        event_quality: rec.eventQuality,
        mean_accel_mps2: rec.meanAccelMps2,
        duration_s: rec.durationS,
        steps: rec.steps,
        coverage_ratio: rec.coverageRatio,
        missing_evidence_fields_json: missingEvidenceFields(rec),
        reason_codes_json: rec.reasonCodes,
        null_intensity_semantics:
          rec.classification === 'EXCLUDED_ARTEFACT'
            ? 'EXCLUDED_NOT_ZERO'
            : 'UNRATED_NOT_IMPUTED',
      };
      lines.push(EXCLUSIONS_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildCoverageSummary(
  input: Ds4Layer2HistoricalExportBuildInputV1,
  rows: readonly Ds4Layer2HistoricalExportAssessmentRowV1[],
  eventCount: number,
  exclusionCount: number,
): Record<string, unknown> {
  const byVehicle = new Map<string, number>();
  const bySourceFamily = new Map<string, number>();
  const bySpeedAuthority = new Map<string, number>();
  const byStatus = new Map<string, number>();
  let exposureAvailable = 0;
  let distanceAvailable = 0;
  let accelAdmissible = 0;
  let brakeAdmissible = 0;

  for (const row of rows) {
    byVehicle.set(row.vehicleId, (byVehicle.get(row.vehicleId) ?? 0) + 1);
    const sf = row.motionPin.sourceFamily ?? 'UNKNOWN';
    bySourceFamily.set(sf, (bySourceFamily.get(sf) ?? 0) + 1);
    const sa = row.speedAuthority ?? 'NULL';
    bySpeedAuthority.set(sa, (bySpeedAuthority.get(sa) ?? 0) + 1);
    byStatus.set(row.assessmentStatus, (byStatus.get(row.assessmentStatus) ?? 0) + 1);
    if (row.longitudinalLoad.exposureSeconds != null) exposureAvailable += 1;
    if (row.longitudinalLoad.distanceKm != null) distanceAvailable += 1;
    accelAdmissible += row.longitudinalLoad.acceleration.admissibleEventCount;
    brakeAdmissible += row.longitudinalLoad.deceleration.admissibleEventCount;
  }

  const distinctTrips = new Set(rows.map((r) => r.tripId)).size;

  return {
    exportSchemaVersion: DS4_LAYER2_HISTORICAL_EXPORT_SCHEMA_VERSION_V1,
    organizationId: input.organizationId,
    counts: {
      assessmentRows: rows.length,
      distinctTrips,
      longitudinalEventRows: eventCount,
      exclusionRows: exclusionCount,
      motionRunsReferenced: rows.length,
      note: 'motion_run_and_distinct_trip_fleet_counts_require_separate_motion_table_query_not_in_P1_scope',
    },
    byVehicleId: Object.fromEntries([...byVehicle.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    bySourceFamily: Object.fromEntries([...bySourceFamily.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    bySpeedAuthority: Object.fromEntries([...bySpeedAuthority.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    byAssessmentStatus: Object.fromEntries([...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    exposure: {
      assessmentsWithValidatedExposureSeconds: exposureAvailable,
      assessmentsWithValidatedDistanceKm: distanceAvailable,
      assessmentsMissingExposure: rows.length - exposureAvailable,
      assessmentsMissingDistance: rows.length - distanceAvailable,
    },
    longitudinalKindTotals: {
      accelAdmissibleEventCountSum: accelAdmissible,
      brakeAdmissibleEventCountSum: brakeAdmissible,
    },
    teslaPersistedAssessmentCoverage: {
      vehicleId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      persistedAssessmentRows: byVehicle.get('68868291-5478-42cd-b0c4-cc77b2a78e21') ?? 0,
      note: 'API_SYNTHETIC_Tesla_rows_absent_in_P1_persisted_collection',
    },
  };
}

export function buildDs4Layer2HistoricalExportArtifactsV1(
  input: Ds4Layer2HistoricalExportBuildInputV1,
): Ds4Layer2HistoricalExportArtifactsV1 {
  const rows = stableSortRows(input.rows);
  if (rows.some((r) => r.organizationId !== input.organizationId)) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1('Row organizationId does not match export scope');
  }

  const assessmentsCsv = buildAssessmentsCsv(rows);
  const longitudinalEventsCsv = buildLongitudinalEventsCsv(rows);
  const exclusionsCsv = buildExclusionsCsv(rows);

  const eventCount = longitudinalEventsCsv.split('\n').filter((l, i) => i > 0 && l.length > 0).length;
  const exclusionCount = exclusionsCsv.split('\n').filter((l, i) => i > 0 && l.length > 0).length;

  const coverageSummary = buildCoverageSummary(input, rows, eventCount, exclusionCount);

  const fileChecksums: Record<string, string> = {
    'assessments.csv': sha256Hex(assessmentsCsv),
    'longitudinal_events.csv': sha256Hex(longitudinalEventsCsv),
    'exclusions.csv': sha256Hex(exclusionsCsv),
    'coverage_summary.json': sha256Hex(`${JSON.stringify(coverageSummary, null, 2)}\n`),
  };

  const manifestWithoutSelfChecksum: Record<string, unknown> = {
    exportSchemaVersion: DS4_LAYER2_HISTORICAL_EXPORT_SCHEMA_VERSION_V1,
    exportedAtUtc: input.exportedAt.toISOString(),
    organizationId: input.organizationId,
    evaluationCodeSha: input.evaluationCodeSha,
    evaluationCodeAttestation: {
      evaluationCodeSha: input.evaluationCodeSha,
      note:
        'Layer-2 observables are re-projected at export time from persisted assessment JSON using the exporter code at evaluationCodeSha; per-row computed_at_utc and motion/assessment provenance identify historical compute, not this export checkout.',
    },
    contractVersions: DS4_LAYER2_HISTORICAL_EXPORT_CONTRACT_VERSIONS_V1,
    collectionCutoffUtc: input.collectionCutoffUtc,
    sourceCollection: input.sourceCollection,
    reconstructionMode: DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1,
    rowCounts: {
      assessments: rows.length,
      distinctTrips: new Set(rows.map((r) => r.tripId)).size,
      longitudinalEvents: eventCount,
      exclusions: exclusionCount,
    },
    artifactFiles: [...DS4_LAYER2_HISTORICAL_EXPORT_ARTIFACT_FILES_V1],
    fileChecksumsSha256: fileChecksums,
  };

  const manifestJsonBody = `${JSON.stringify(manifestWithoutSelfChecksum, null, 2)}\n`;
  fileChecksums['manifest.json'] = sha256Hex(manifestJsonBody);
  const manifest: Record<string, unknown> = {
    ...manifestWithoutSelfChecksum,
    fileChecksumsSha256: { ...fileChecksums },
  };

  return {
    manifest,
    assessmentsCsv,
    longitudinalEventsCsv,
    exclusionsCsv,
    coverageSummary,
    fileChecksums,
  };
}

export function defaultCollectionCutoffUtcForExportV1(): string {
  return DI_V0_DS4_ASSESSMENT_PROPOSED_COLLECTION_CUTOFF_UTC;
}
