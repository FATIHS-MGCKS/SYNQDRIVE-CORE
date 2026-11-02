import { createHash } from 'crypto';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import { coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1 } from '../ds4-longitudinal-load-observables.v1';
import {
  DS4_LAYER2_P2_FEASIBILITY_AUDIT_OPERATION_V1,
  DS4_LAYER2_P2_OFFLINE_ARTIFACT_FILES_V1,
  DS4_LAYER2_P2_OFFLINE_CONTRACT_VERSIONS_V1,
  DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_SCHEMA_VERSION_V1,
  DS4_LAYER2_P2_RECONSTRUCTION_MODE_V1,
} from './ds4-layer2-p2-offline-reconstruction.v1.contract';
import type { Ds4Layer2P2OfflineReconstructedRowV1 } from './ds4-layer2-p2-offline-reconstruction.v1';
import type { Ds4Layer2P2RevisionSelectionRowV1 } from './ds4-layer2-p2-offline-reconstruction.revision-selector.v1';

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
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return csvEscape(JSON.stringify(value));
  return csvEscape(String(value));
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function kindObservablesColumns(prefix: 'accel' | 'brake', kind: Ds4Layer2P2OfflineReconstructedRowV1['longitudinalLoad']['acceleration']) {
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
  'reconstruction_mode',
  'evaluation_code_sha',
  'reconstructed_at_utc',
  'offline_reconstruction_key',
  'organization_id',
  'vehicle_id',
  'trip_id',
  'source_motion_run_id',
  'pinned_snapshot_hash',
  'combined_input_identity',
  'event_row_contract',
  'shadow_bundle_version',
  'content_fingerprint',
  'source_family',
  'speed_authority',
  'assessment_version',
  'assessment_status',
  'evidence_quality',
  'assessment_reason_codes_json',
  'layer2_reason_codes_json',
  'exposure_seconds_Es',
  'distance_km_D',
  'exposure_coverage_ratio',
  'mean_moving_speed_kmh',
  'exposure_derivable',
  'exposure_provenance_version',
  ...Object.keys(kindObservablesColumns('accel', {} as Ds4Layer2P2OfflineReconstructedRowV1['longitudinalLoad']['acceleration'])),
  ...Object.keys(kindObservablesColumns('brake', {} as Ds4Layer2P2OfflineReconstructedRowV1['longitudinalLoad']['acceleration'])),
] as const;

const REVISION_CSV_COLUMNS = [
  'trip_id',
  'motion_run_id',
  'created_at_utc',
  'selected',
  'rejection_reasons_json',
  'pinned_snapshot_hash',
  'combined_input_identity',
  'content_fingerprint',
  'payload_contract',
  'collection_eligible',
  'speed_authority',
  'exposure_derivable',
] as const;

const LONGITUDINAL_EVENTS_CSV_COLUMNS = [
  'offline_reconstruction_key',
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
  'reason_codes_json',
] as const;

const EXCLUSIONS_CSV_COLUMNS = [
  'offline_reconstruction_key',
  'trip_id',
  'source_motion_run_id',
  'event_index',
  'event_kind',
  'eligibility_classification',
  'duration_tier',
  'event_quality',
  'mean_accel_mps2',
  'null_intensity_semantics',
  'reason_codes_json',
] as const;

function isExclusionRecord(record: Ds4EventIntensityEligibilityRecordV1): boolean {
  return record.classification === 'EXCLUDED_ARTEFACT' || record.classification === 'UNRATED';
}

export type Ds4Layer2P2OfflineArtifactsV1 = {
  manifest: Record<string, unknown>;
  reconstructedAssessmentsCsv: string;
  longitudinalEventsCsv: string;
  exclusionsCsv: string;
  revisionSelectionCsv: string;
  coverageSummary: Record<string, unknown>;
  fileChecksums: Record<string, string>;
};

export function buildDs4Layer2P2OfflineArtifactsV1(input: {
  organizationId: string;
  evaluationCodeSha: string;
  reconstructedAt: Date;
  feasibilityAuditProductionSha?: string | null;
  revisionSelectionPolicy: string;
  rows: readonly Ds4Layer2P2OfflineReconstructedRowV1[];
  revisionRows: readonly Ds4Layer2P2RevisionSelectionRowV1[];
}): Ds4Layer2P2OfflineArtifactsV1 {
  const sortedRows = [...input.rows].sort((a, b) => a.tripId.localeCompare(b.tripId));

  const assessmentLines = [ASSESSMENTS_CSV_COLUMNS.join(',')];
  for (const row of sortedRows) {
    const l2 = row.longitudinalLoad;
    const exposure = coerceDs4TripAssessmentEventSummariesFromPersistedJsonV1(
      row.eventSummariesJson,
      row.speedAuthority,
    ).drivingExposure;
    const record: Record<string, unknown> = {
      reconstruction_mode: row.reconstructionMode,
      evaluation_code_sha: row.evaluationCodeSha,
      reconstructed_at_utc: row.reconstructedAtUtc,
      offline_reconstruction_key: row.offlineReconstructionKey,
      organization_id: row.organizationId,
      vehicle_id: row.vehicleId,
      trip_id: row.tripId,
      source_motion_run_id: row.sourceMotionRunId,
      pinned_snapshot_hash: row.pinnedSnapshotHash,
      combined_input_identity: row.combinedInputIdentity,
      event_row_contract: row.eventRowContract,
      shadow_bundle_version: row.motionPin.shadowBundleVersion,
      content_fingerprint: row.motionPin.contentFingerprint,
      source_family: row.sourceFamily,
      speed_authority: row.speedAuthority,
      assessment_version: row.assessmentVersion,
      assessment_status: row.assessmentStatus,
      evidence_quality: row.evidenceQuality,
      assessment_reason_codes_json: row.reasonCodes,
      layer2_reason_codes_json: l2.reasonCodes,
      exposure_seconds_Es: l2.exposureSeconds,
      distance_km_D: l2.distanceKm,
      exposure_coverage_ratio: l2.exposureCoverageRatio,
      mean_moving_speed_kmh: l2.meanMovingSpeedKmh,
      exposure_derivable: exposure.derivable,
      exposure_provenance_version: exposure.provenance?.provenanceVersion ?? null,
      ...kindObservablesColumns('accel', l2.acceleration),
      ...kindObservablesColumns('brake', l2.deceleration),
    };
    assessmentLines.push(ASSESSMENTS_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
  }
  const reconstructedAssessmentsCsv = `${assessmentLines.join('\n')}\n`;

  const eventLines = [LONGITUDINAL_EVENTS_CSV_COLUMNS.join(',')];
  for (const row of sortedRows) {
    for (const rec of [...row.eventIntensityRecords].sort((a, b) => a.eventIndex - b.eventIndex)) {
      if (isExclusionRecord(rec)) continue;
      const record: Record<string, unknown> = {
        offline_reconstruction_key: row.offlineReconstructionKey,
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
        reason_codes_json: rec.reasonCodes,
      };
      eventLines.push(LONGITUDINAL_EVENTS_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
    }
  }
  const longitudinalEventsCsv = `${eventLines.join('\n')}\n`;

  const exclusionLines = [EXCLUSIONS_CSV_COLUMNS.join(',')];
  for (const row of sortedRows) {
    for (const rec of row.eventIntensityRecords) {
      if (!isExclusionRecord(rec)) continue;
      const record: Record<string, unknown> = {
        offline_reconstruction_key: row.offlineReconstructionKey,
        trip_id: row.tripId,
        source_motion_run_id: row.sourceMotionRunId,
        event_index: rec.eventIndex,
        event_kind: rec.kind,
        eligibility_classification: rec.classification,
        duration_tier: rec.durationTier,
        event_quality: rec.eventQuality,
        mean_accel_mps2: rec.meanAccelMps2,
        null_intensity_semantics:
          rec.classification === 'EXCLUDED_ARTEFACT' ? 'EXCLUDED_NOT_ZERO' : 'UNRATED_NOT_IMPUTED',
        reason_codes_json: rec.reasonCodes,
      };
      exclusionLines.push(EXCLUSIONS_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
    }
  }
  const exclusionsCsv = `${exclusionLines.join('\n')}\n`;

  const revisionLines = [REVISION_CSV_COLUMNS.join(',')];
  for (const rev of [...input.revisionRows].sort((a, b) => {
    const t = a.tripId.localeCompare(b.tripId);
    return t !== 0 ? t : a.createdAtUtc.localeCompare(b.createdAtUtc);
  })) {
    const record: Record<string, unknown> = {
      trip_id: rev.tripId,
      motion_run_id: rev.motionRunId,
      created_at_utc: rev.createdAtUtc,
      selected: rev.selected,
      rejection_reasons_json: rev.rejectionReasons,
      pinned_snapshot_hash: rev.pinnedSnapshotHash,
      combined_input_identity: rev.combinedInputIdentity,
      content_fingerprint: rev.contentFingerprint,
      payload_contract: rev.payloadContract,
      collection_eligible: rev.collectionEligible,
      speed_authority: rev.speedAuthority,
      exposure_derivable: rev.exposureDerivable,
    };
    revisionLines.push(REVISION_CSV_COLUMNS.map((col) => csvCell(record[col])).join(','));
  }
  const revisionSelectionCsv = `${revisionLines.join('\n')}\n`;

  const eventCount = longitudinalEventsCsv.split('\n').filter((l, i) => i > 0 && l.length > 0).length;
  const exclusionCount = exclusionsCsv.split('\n').filter((l, i) => i > 0 && l.length > 0).length;

  const bySourceFamily: Record<string, number> = {};
  const bySpeedAuthority: Record<string, number> = {};
  for (const row of sortedRows) {
    const sf = row.sourceFamily ?? 'UNKNOWN';
    bySourceFamily[sf] = (bySourceFamily[sf] ?? 0) + 1;
    const sa = row.speedAuthority ?? 'NULL';
    bySpeedAuthority[sa] = (bySpeedAuthority[sa] ?? 0) + 1;
  }

  const coverageSummary = {
    p2OfflineSchemaVersion: DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_SCHEMA_VERSION_V1,
    organizationId: input.organizationId,
    reconstructionMode: DS4_LAYER2_P2_RECONSTRUCTION_MODE_V1,
    p1Isolation: {
      persistedAssessmentTable: 'di_v0_ds4_trip_assessment_v1',
      note: 'P2 rows are NEWLY_COMPUTED_OFFLINE only; never merged into P1 canonical export',
    },
    counts: {
      reconstructedTrips: sortedRows.length,
      longitudinalEventRows: eventCount,
      exclusionRows: exclusionCount,
      revisionSelectionRows: input.revisionRows.length,
    },
    bySourceFamily,
    bySpeedAuthority,
  };

  const fileChecksums: Record<string, string> = {
    'p2_reconstructed_assessments.csv': sha256Hex(reconstructedAssessmentsCsv),
    'p2_longitudinal_events.csv': sha256Hex(longitudinalEventsCsv),
    'p2_exclusions.csv': sha256Hex(exclusionsCsv),
    'p2_revision_selection.csv': sha256Hex(revisionSelectionCsv),
    'p2_coverage_summary.json': sha256Hex(`${JSON.stringify(coverageSummary, null, 2)}\n`),
  };

  const manifestWithoutSelf: Record<string, unknown> = {
    p2OfflineSchemaVersion: DS4_LAYER2_P2_OFFLINE_RECONSTRUCTION_SCHEMA_VERSION_V1,
    reconstructedAtUtc: input.reconstructedAt.toISOString(),
    organizationId: input.organizationId,
    evaluationCodeSha: input.evaluationCodeSha,
    reconstructionMode: DS4_LAYER2_P2_RECONSTRUCTION_MODE_V1,
    contractVersions: DS4_LAYER2_P2_OFFLINE_CONTRACT_VERSIONS_V1,
    feasibilityAudit: {
      operation: DS4_LAYER2_P2_FEASIBILITY_AUDIT_OPERATION_V1,
      productionShaAtAudit: input.feasibilityAuditProductionSha ?? null,
      pilotCohortSize: sortedRows.length,
    },
    revisionSelectionPolicy: input.revisionSelectionPolicy,
    sourceCollection: {
      motionTable: 'di_v0_motion_core_shadow_runs_v1',
      organizationScope: input.organizationId,
      readOnly: true,
      persistedAssessmentsWritten: false,
    },
    rowProvenance: sortedRows.map((row) => ({
      reconstructionMode: row.reconstructionMode,
      evaluationCodeSha: row.evaluationCodeSha,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tripId: row.tripId,
      sourceFamily: row.sourceFamily,
      speedAuthority: row.speedAuthority,
      sourceMotionRunId: row.sourceMotionRunId,
      pinnedSnapshotHash: row.pinnedSnapshotHash,
      combinedInputIdentity: row.combinedInputIdentity,
      eventRowContract: row.eventRowContract,
      offlineReconstructionKey: row.offlineReconstructionKey,
      reconstructedAtUtc: row.reconstructedAtUtc,
    })),
    artifactFiles: [...DS4_LAYER2_P2_OFFLINE_ARTIFACT_FILES_V1],
    fileChecksumsSha256: fileChecksums,
    rowCounts: coverageSummary.counts,
  };

  const manifest = {
    ...manifestWithoutSelf,
    manifestChecksumSha256: sha256Hex(`${JSON.stringify(manifestWithoutSelf, null, 2)}\n`),
  };

  return {
    manifest,
    reconstructedAssessmentsCsv,
    longitudinalEventsCsv,
    exclusionsCsv,
    revisionSelectionCsv,
    coverageSummary,
    fileChecksums,
  };
}
