import type {
  Ds4Layer2P4bEventSpeedEvidenceRowV1,
  Ds4Layer2P4bJoinExclusionRowV1,
  Ds4Layer2P4bP2AdmissibleEventRowV1,
} from './ds4-layer2-p4b-event-kinematics-evidence.v1.contract';
import {
  buildDs4Layer2P4bEventKinematicsEvidenceV1,
  buildDs4Layer2P4bSidecarArtifactsV1,
} from './ds4-layer2-p4b-event-kinematics-evidence.v1';
import { computeDs4Layer2P4bInWindowSpeedKinematicsV1 } from './ds4-layer2-p4b-in-window-speed.v1';
import {
  detectDuplicateP4bJoinKeysV1,
  joinDs4Layer2P4bP2EventToMotionPayloadV1,
} from './ds4-layer2-p4b-event-join.v1';
import type {
  Ds4Layer2P4bMotionPayloadLoaderV1,
  Ds4Layer2P4bPayloadLoadResultV1,
} from './ds4-layer2-p4b-payload-loader.v1';
import {
  DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
  DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1,
} from './ds4-layer2-p2-pinned-11.attestation.v1';
import {
  DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1,
} from './ds4-layer2-p4b-pinned-source-runs.v1';
import {
  DS4_LAYER2_P4E_REPAIR_STATE_EVIDENCE_SCHEMA_VERSION_V1,
  DS4_LAYER2_P4E_SIDECAR_ARTIFACT_FILES_V1,
} from './ds4-layer2-p4e-repair-state-evidence.v1.contract';
import type { Ds4Layer2P4eRepairStateEvidenceV1 } from './ds4-layer2-p4e-repair-state-evidence.v1.contract';
import {
  aggregateDs4Layer2P4eRepairStateHistogramV1,
  computeDs4Layer2P4eRepairStateEvidenceV1,
} from './ds4-layer2-p4e-repair-state-evidence.v1';
import { createHash } from 'crypto';

export type Ds4Layer2P4eEventSpeedEvidenceRowV1 = Ds4Layer2P4bEventSpeedEvidenceRowV1 & {
  repairInfluencedLegacy: boolean;
  repairAcceptedInWindow: boolean;
  repairSuspicionInWindow: boolean;
  repairEvidenceAvailability: string;
  boundaryStartRepairState: string;
  boundaryEndRepairState: string;
  inWindowRepairAcceptedCount: number;
  inWindowRepairRejectedCount: number;
  inWindowRepairUncertainCount: number;
  inWindowRepairPassThroughCount: number;
  inWindowRepairUnknownStateCount: number;
  inWindowRepairRowCount: number;
  windowLimitationReasonsP4eJson: string;
};

function jsonReasons(reasons: readonly string[]): string {
  return JSON.stringify(reasons);
}

function boundaryClass(start: number | null, end: number | null) {
  if (start != null && end != null && Number.isFinite(start) && Number.isFinite(end)) {
    return 'PERSISTED_BOUNDARY' as const;
  }
  return 'UNAVAILABLE' as const;
}

function windowClass(input: { limitations: readonly string[]; sampleCount: number | null }) {
  if (
    input.sampleCount != null &&
    input.sampleCount > 0 &&
    input.limitations.every((l) => l !== 'NO_NUMERIC_SPEED_IN_WINDOW')
  ) {
    return 'DERIVED_IN_WINDOW' as const;
  }
  return 'UNAVAILABLE' as const;
}

export async function buildDs4Layer2P4eEventKinematicsEvidenceV1(input: {
  organizationId: string;
  admissibleEvents: readonly Ds4Layer2P4bP2AdmissibleEventRowV1[];
  payloadLoader: Ds4Layer2P4bMotionPayloadLoaderV1;
}): Promise<{
  evidenceRows: Ds4Layer2P4eEventSpeedEvidenceRowV1[];
  joinExclusions: Ds4Layer2P4bJoinExclusionRowV1[];
  summary: Record<string, unknown>;
  repairHistogram: Record<string, unknown>;
  legacyP4bBuilt: Awaited<ReturnType<typeof buildDs4Layer2P4bEventKinematicsEvidenceV1>>;
}> {
  const legacyP4bBuilt = await buildDs4Layer2P4bEventKinematicsEvidenceV1(input);

  const joinExclusions: Ds4Layer2P4bJoinExclusionRowV1[] = [...detectDuplicateP4bJoinKeysV1(input.admissibleEvents)];
  const duplicateKeys = new Set(
    joinExclusions
      .filter((e) => e.failureReason === 'DUPLICATE_EVENT_INDEX')
      .map((e) => `${e.tripId}|${e.sourceMotionRunId}|${e.eventIndex}`),
  );

  const payloadCache = new Map<string, Ds4Layer2P4bPayloadLoadResultV1>();
  const evidenceRows: Ds4Layer2P4eEventSpeedEvidenceRowV1[] = [];
  const repairEvidenceCollected: Ds4Layer2P4eRepairStateEvidenceV1[] = [];

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
    const kinematics = computeDs4Layer2P4bInWindowSpeedKinematicsV1({
      payload: loaded.payload,
      startLabel: p2Event.startLabelUtc,
      endLabel: p2Event.endLabelUtc,
      durationTier: p2Event.durationTier,
      steps: p2Event.steps,
      coverageRatio: p2Event.coverageRatio,
    });
    const repair = computeDs4Layer2P4eRepairStateEvidenceV1({
      payload: loaded.payload,
      payloadSpeedAuthority: loaded.speedAuthority,
      startLabel: p2Event.startLabelUtc,
      endLabel: p2Event.endLabelUtc,
      durationTier: p2Event.durationTier,
      kinematicLimitations: kinematics.kinematicLimitations,
    });
    repairEvidenceCollected.push(repair);

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
      windowMinSpeedKmh: kinematics.windowMinSpeedKmh,
      windowMaxSpeedKmh: kinematics.windowMaxSpeedKmh,
      windowMeanSpeedKmh: kinematics.windowMeanSpeedKmh,
      windowSampleCount: kinematics.windowSampleCount,
      windowExpectedSampleCount: kinematics.windowExpectedSampleCount,
      windowCoverageRatio: kinematics.windowCoverageRatio,
      windowEvidenceClass: windowClass({
        limitations: repair.limitations,
        sampleCount: kinematics.windowSampleCount,
      }),
      windowLimitationReasonsJson: jsonReasons(
        repair.limitations.filter((l) => l !== 'REPAIR_INFLUENCED_SAMPLE'),
      ),
      repairInfluenced: repair.repairInfluencedLegacy,
      repairInfluencedLegacy: repair.repairInfluencedLegacy,
      repairAcceptedInWindow: repair.repairAcceptedInWindow,
      repairSuspicionInWindow: repair.repairSuspicionInWindow,
      repairEvidenceAvailability: repair.repairEvidenceAvailability,
      boundaryStartRepairState: repair.boundaryStartRepairState,
      boundaryEndRepairState: repair.boundaryEndRepairState,
      inWindowRepairAcceptedCount: repair.histogram.repairAcceptedInWindow,
      inWindowRepairRejectedCount: repair.histogram.repairRejectedInWindow,
      inWindowRepairUncertainCount: repair.histogram.repairUncertainInWindow,
      inWindowRepairPassThroughCount: repair.histogram.repairPassThroughInWindow,
      inWindowRepairUnknownStateCount: repair.histogram.repairUnknownStateInWindow,
      inWindowRepairRowCount: repair.histogram.inWindowRepairRowCount,
      windowLimitationReasonsP4eJson: jsonReasons(repair.limitations),
      peakAccelMps2: null,
      peakEvidenceStatus: 'UNAVAILABLE',
      peakUnavailabilityReason: 'NOT_PERSISTED_IN_MOTION_V2_CONTRACT',
      qualityLimitationReasonsJson: jsonReasons(qualityLimitations),
    });
  }

  const repairHistogram = aggregateDs4Layer2P4eRepairStateHistogramV1(repairEvidenceCollected);

  const summary = {
    ...legacyP4bBuilt.summary,
    p4eRepairSemanticsVersion: DS4_LAYER2_P4E_REPAIR_STATE_EVIDENCE_SCHEMA_VERSION_V1,
    repairInfluencedLegacyEventCount: repairHistogram.legacyRepairInfluencedEventCount,
    repairAcceptedInWindowEventCount: repairHistogram.repairAcceptedInWindowEventCount,
    repairSuspicionInWindowEventCount: repairHistogram.repairSuspicionInWindowEventCount,
    expectedAdmissibleEventCount: DS4_LAYER2_P2_PINNED_11_ADMISSIBLE_EVENT_COUNT_V1,
    exactJoinCount: evidenceRows.length,
    p2InputChecksumsSha256: { ...DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1 },
    p2ManifestChecksumSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
  };

  return {
    evidenceRows,
    joinExclusions: legacyP4bBuilt.joinExclusions,
    summary,
    repairHistogram,
    legacyP4bBuilt,
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

const P4E_EVIDENCE_CSV_COLUMNS = [
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
  'repair_influenced_legacy',
  'repair_accepted_in_window',
  'repair_suspicion_in_window',
  'repair_evidence_availability',
  'boundary_start_repair_state',
  'boundary_end_repair_state',
  'in_window_repair_accepted_count',
  'in_window_repair_rejected_count',
  'in_window_repair_uncertain_count',
  'in_window_repair_pass_through_count',
  'in_window_repair_unknown_state_count',
  'in_window_repair_row_count',
  'window_limitation_reasons_p4e_json',
  'repair_influenced',
  'peak_accel_mps2',
  'peak_evidence_status',
  'peak_unavailability_reason',
  'quality_limitation_reasons_json',
] as const;

export function buildDs4Layer2P4eSidecarArtifactsV1(input: {
  p4eEvaluationCodeSha: string;
  p2EvaluationCodeSha: string;
  p3cMergeShaReference: string;
  organizationId: string;
  builtAtUtc: Date;
  evidenceRows: readonly Ds4Layer2P4eEventSpeedEvidenceRowV1[];
  joinExclusions: readonly Ds4Layer2P4bJoinExclusionRowV1[];
  summary: Record<string, unknown>;
  repairHistogram: Record<string, unknown>;
  pinnedSourceRuns: typeof DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1;
  validationReportMarkdown: string;
}): {
  manifest: Record<string, unknown>;
  eventSpeedEvidenceCsv: string;
  repairStateHistogramJson: string;
  joinExclusionsCsv: string;
  coverageSummaryJson: string;
  validationReportMarkdown: string;
  fileChecksums: Record<string, string>;
  legacyP4bArtifacts: ReturnType<typeof buildDs4Layer2P4bSidecarArtifactsV1>;
} {
  const legacyP4bArtifacts = buildDs4Layer2P4bSidecarArtifactsV1({
    p4bEvaluationCodeSha: input.p4eEvaluationCodeSha,
    p2EvaluationCodeSha: input.p2EvaluationCodeSha,
    p3cMergeShaReference: input.p3cMergeShaReference,
    organizationId: input.organizationId,
    builtAtUtc: input.builtAtUtc,
    evidenceRows: input.evidenceRows,
    joinExclusions: input.joinExclusions,
    summary: input.summary,
    pinnedSourceRuns: input.pinnedSourceRuns,
  });

  const evidenceLines = [P4E_EVIDENCE_CSV_COLUMNS.join(',')];
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
      repair_influenced_legacy: row.repairInfluencedLegacy,
      repair_accepted_in_window: row.repairAcceptedInWindow,
      repair_suspicion_in_window: row.repairSuspicionInWindow,
      repair_evidence_availability: row.repairEvidenceAvailability,
      boundary_start_repair_state: row.boundaryStartRepairState,
      boundary_end_repair_state: row.boundaryEndRepairState,
      in_window_repair_accepted_count: row.inWindowRepairAcceptedCount,
      in_window_repair_rejected_count: row.inWindowRepairRejectedCount,
      in_window_repair_uncertain_count: row.inWindowRepairUncertainCount,
      in_window_repair_pass_through_count: row.inWindowRepairPassThroughCount,
      in_window_repair_unknown_state_count: row.inWindowRepairUnknownStateCount,
      in_window_repair_row_count: row.inWindowRepairRowCount,
      window_limitation_reasons_p4e_json: row.windowLimitationReasonsP4eJson,
      repair_influenced: row.repairInfluenced,
      peak_accel_mps2: row.peakAccelMps2,
      peak_evidence_status: row.peakEvidenceStatus,
      peak_unavailability_reason: row.peakUnavailabilityReason,
      quality_limitation_reasons_json: row.qualityLimitationReasonsJson,
    };
    evidenceLines.push(P4E_EVIDENCE_CSV_COLUMNS.map((c) => csvCell(map[c])).join(','));
  }
  const eventSpeedEvidenceCsv = `${evidenceLines.join('\n')}\n`;

  const repairStateHistogramJson = `${JSON.stringify(input.repairHistogram, null, 2)}\n`;
  const coverageSummaryJson = `${JSON.stringify(input.summary, null, 2)}\n`;
  const validationReportMarkdown = input.validationReportMarkdown.endsWith('\n')
    ? input.validationReportMarkdown
    : `${input.validationReportMarkdown}\n`;

  const fileChecksums: Record<string, string> = {
    'p4e_event_speed_evidence.csv': sha256Hex(eventSpeedEvidenceCsv),
    'p4e_repair_state_histogram.json': sha256Hex(repairStateHistogramJson),
    'p4e_join_exclusions.csv': legacyP4bArtifacts.joinExclusionsCsv
      ? sha256Hex(legacyP4bArtifacts.joinExclusionsCsv)
      : sha256Hex(''),
    'p4e_coverage_summary.json': sha256Hex(coverageSummaryJson),
    'P4E_VALIDATION_REPORT.md': sha256Hex(validationReportMarkdown),
    p4b_reference_manifest_checksum: String(legacyP4bArtifacts.manifest.manifestChecksumSha256),
  };

  const manifestWithoutSelf: Record<string, unknown> = {
    schemaVersion: DS4_LAYER2_P4E_REPAIR_STATE_EVIDENCE_SCHEMA_VERSION_V1,
    builtAtUtc: input.builtAtUtc.toISOString(),
    organizationId: input.organizationId,
    p4eEvaluationCodeSha: input.p4eEvaluationCodeSha,
    p2EvaluationCodeSha: input.p2EvaluationCodeSha,
    p3cMergeShaReference: input.p3cMergeShaReference,
    p2InputChecksumsSha256: { ...DS4_LAYER2_P2_PINNED_11_FILE_CHECKSUMS_SHA256_V1 },
    p2ManifestChecksumSha256: DS4_LAYER2_P2_PINNED_11_MANIFEST_CHECKSUM_SHA256_V1,
    pinnedSourceMotionRuns: input.pinnedSourceRuns,
    repairSemanticsPolicy: 'P4E_A1_ACCEPTED_REPAIR_ONLY',
    legacyP4bSidecarReference: {
      schemaVersion: legacyP4bArtifacts.manifest.schemaVersion,
      manifestChecksumSha256: legacyP4bArtifacts.manifest.manifestChecksumSha256,
      note: 'Original P4B artifact shape preserved via buildDs4Layer2P4bSidecarArtifactsV1 for immutability checks',
    },
    summary: input.summary,
    repairHistogram: input.repairHistogram,
    artifactFiles: [...DS4_LAYER2_P4E_SIDECAR_ARTIFACT_FILES_V1],
    fileChecksumsSha256: fileChecksums,
  };

  const manifest = {
    ...manifestWithoutSelf,
    manifestChecksumSha256: sha256Hex(`${JSON.stringify(manifestWithoutSelf, null, 2)}\n`),
  };

  return {
    manifest,
    eventSpeedEvidenceCsv,
    repairStateHistogramJson,
    joinExclusionsCsv: legacyP4bArtifacts.joinExclusionsCsv,
    coverageSummaryJson,
    validationReportMarkdown,
    fileChecksums,
    legacyP4bArtifacts,
  };
}

export function buildDs4Layer2P4eValidationReportMarkdownV1(input: {
  baseSha: string;
  evaluationCodeSha: string;
  builtAtUtc: Date;
  repairHistogram: Record<string, unknown>;
  legacyFlagCount: number;
  legacyMatchesAuthority: boolean;
  acceptedInWindowEventCount: number;
  p2ChecksumsUnchanged: boolean;
  exactJoinCount: number;
  negativeControlsPassed: boolean;
  realPayloadSource: 'PRODUCTION_READ_ONLY' | 'SYNTHETIC_TEST_HARNESS' | 'MIXED';
}): string {
  return `# P4E A1 repair semantics validation

**Operation:** \`DS4_LAYER2_P4E_A1_REPAIR_SEMANTICS_CORRECTION\`
**Built at:** ${input.builtAtUtc.toISOString()}
**Evaluation code SHA:** ${input.evaluationCodeSha}
**Repository baseline SHA (at build):** ${input.baseSha}
**Real-payload source:** ${input.realPayloadSource}

## Root cause

Legacy P4B research predicate \`isRepairInfluenced\` in \`ds4-layer2-p4b-in-window-speed.v1.ts\` returned true for **any** persisted \`speedRepairs[]\` row in the event window whose \`repairState\` was not \`NONE\`/\`UNREPAIRED\`. C5.1 persists one repair row per grid label including \`PASS_THROUGH_OUTSIDE_WINDOW\` and \`PASS_THROUGH_NO_REPAIR\` (\`buildRepairRows\` in \`di-v0-motion-core-shadow-processor.ts\`). On the pinned cohort this made \`repair_influenced\` equivalent to \`payload_speed_authority === C5_1_PREFERRED\` (${input.legacyFlagCount}/129), not evidence of an accepted repair.

## Legacy reproduction

- Legacy flags reproduced: **${input.legacyFlagCount}/129**
- Perfect correlation with C5.1 authority (not accepted repair): **${input.legacyMatchesAuthority ? 'YES' : 'NO'}**

## Accepted repair hypothesis (Fable)

Events with \`repair_accepted_in_window=true\` (at least one in-window \`REPAIR_ACCEPTED\` row): **${input.acceptedInWindowEventCount}**

## Repair-state histogram

\`\`\`json
${JSON.stringify(input.repairHistogram, null, 2)}
\`\`\`

## Invariants

| Check | Result |
|---|---|
| P2 fixture checksums unchanged | ${input.p2ChecksumsUnchanged ? 'PASS' : 'FAIL'} |
| Exactly 129 admissible joins | ${input.exactJoinCount === 129 ? 'PASS' : 'FAIL'} (${input.exactJoinCount}) |
| Negative controls (unit harness) | ${input.negativeControlsPassed ? 'PASS' : 'FAIL'} |
| Production motion/admission/repair algorithms | **NOT MODIFIED** (research sidecar only) |

## New annotation semantics

- \`repair_influenced_legacy\`: historical P4B predicate (reproducibility only)
- \`repair_accepted_in_window\`: true only for in-window \`REPAIR_ACCEPTED\` persisted rows
- \`repair_suspicion_in_window\`: in-window \`REPAIR_REJECTED\` or \`UNCERTAIN\` without accepted repair
- \`repair_evidence_availability\`: \`NOT_APPLICABLE_C4_ONLY\` | \`PAYLOAD_ROWS_PRESENT\` | \`PAYLOAD_ROWS_MISSING\` | \`UNKNOWN_REPAIR_STATE\`
- Window limitations: \`REPAIR_ACCEPTED_IN_WINDOW\` / \`REPAIR_SUSPICION_IN_WINDOW\` replace misleading sole reliance on \`REPAIR_INFLUENCED_SAMPLE\` in P4E CSV (\`window_limitation_reasons_p4e_json\`)
`;
}
