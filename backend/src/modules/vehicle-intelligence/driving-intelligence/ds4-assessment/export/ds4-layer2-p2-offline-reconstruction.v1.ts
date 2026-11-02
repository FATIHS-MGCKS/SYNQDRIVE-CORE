import { gunzipSync } from 'zlib';
import type { DiV0MotionCoreShadowPayloadV1 } from '../../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  resolveMotionCoreShadowEventRowContract,
} from '../../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import { evaluateDs4MotionRunCollectionEligibilityV1 } from '../ds4-assessment-motion-discovery-eligibility.v1';
import { computeDs4TripAssessmentV1 } from '../ds4-trip-assessment-v1.engine';
import type { Ds4SpeedAuthorityPartitionV1 } from '../ds4-trip-assessment-v1.contract';
import { projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1 } from '../ds4-longitudinal-load-observables.v1';
import type { Ds4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality.v1';
import type { Ds4EventIntensityEligibilityRecordV1 } from '../ds4-assessment-event-intensity-eligibility.v1';
import { assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1 } from './ds4-layer2-historical-export-event-summaries-integrity.v1';
import type { Ds4Layer2HistoricalExportMotionPinV1 } from './ds4-layer2-historical-export.v1';
import { Ds4Layer2HistoricalExportIntegrityErrorV1 } from './ds4-layer2-historical-export.v1';
import type { Ds4Layer2P2MotionRevisionCandidateV1 } from './ds4-layer2-p2-offline-reconstruction.revision-selector.v1';

export class Ds4Layer2P2OfflineReconstructionErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ds4Layer2P2OfflineReconstructionErrorV1';
  }
}

/** Same sparse channel outcome persisted on assessments (`evidenceQuality` / motion contract). */
export function resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1(
  payload: DiV0MotionCoreShadowPayloadV1,
): string | null {
  return payload.contract?.sparse?.channelOutcome ?? null;
}

export function decodeMotionCoreShadowPayloadGzipV1(
  payloadGzip: Buffer | null | undefined,
): { payload: DiV0MotionCoreShadowPayloadV1 | null; corrupt: boolean } {
  if (payloadGzip == null || payloadGzip.length === 0) {
    return { payload: null, corrupt: true };
  }
  try {
    const json = gunzipSync(payloadGzip).toString('utf8');
    return { payload: JSON.parse(json) as DiV0MotionCoreShadowPayloadV1, corrupt: false };
  } catch {
    return { payload: null, corrupt: true };
  }
}

export function labelMotionPayloadContractV1(
  payload: DiV0MotionCoreShadowPayloadV1 | null,
  corrupt: boolean,
): string {
  if (corrupt) return 'CORRUPT_GZIP';
  if (payload == null) return 'MISSING_PAYLOAD';
  const resolved = resolveMotionCoreShadowEventRowContract(payload);
  if (resolved === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY) return 'V2_INTENSITY';
  if (resolved === DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY) return 'V1_LEGACY';
  return 'UNKNOWN_DECLARED';
}

export function evaluateDs4Layer2P2MotionRevisionCandidateV1(input: {
  motionRunId: string;
  createdAt: Date;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  summaryJson: unknown;
  payloadGzip: Buffer | null;
  scope: { organizationId: string; vehicleId: string; tripId: string };
}): Ds4Layer2P2MotionRevisionCandidateV1 {
  const { payload, corrupt } = decodeMotionCoreShadowPayloadGzipV1(input.payloadGzip);
  const payloadContract = labelMotionPayloadContractV1(payload, corrupt);

  let collectionEligible = false;
  let collectionIneligibleReason: string | null = null;
  let speedAuthority: Ds4SpeedAuthorityPartitionV1 | null = null;
  let exposureDerivable = false;

  if (payload && !corrupt) {
    const col = evaluateDs4MotionRunCollectionEligibilityV1({
      summaryJson: input.summaryJson as Record<string, unknown>,
      payload,
    });
    collectionEligible = col.eligible;
    collectionIneligibleReason = col.eligible ? null : col.reasonCode;

    const computed = computeDs4TripAssessmentV1({
      scope: input.scope,
      motionRun: {
        id: input.motionRunId,
        organizationId: input.scope.organizationId,
        vehicleId: input.scope.vehicleId,
        tripId: input.scope.tripId,
        shadowStatus: 'SUCCEEDED',
        pinnedSnapshotHash: input.pinnedSnapshotHash,
        combinedInputIdentity: input.combinedInputIdentity,
        contentFingerprint: input.contentFingerprint,
        createdAt: input.createdAt,
      },
      payload,
    });
    speedAuthority = computed.speedAuthority;
    exposureDerivable =
      computed.eventSummaries.drivingExposure.derivable === true &&
      computed.eventSummaries.drivingExposure.exposureSeconds > 0;
  }

  return {
    motionRunId: input.motionRunId,
    createdAtUtc: input.createdAt.toISOString(),
    pinnedSnapshotHash: input.pinnedSnapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
    contentFingerprint: input.contentFingerprint,
    payloadContract,
    collectionEligible,
    collectionIneligibleReason,
    speedAuthority,
    exposureDerivable,
    corruptOrMissingPayload: corrupt || payload == null,
  };
}

export type Ds4Layer2P2OfflineReconstructedRowV1 = {
  reconstructionMode: 'NEWLY_COMPUTED_OFFLINE';
  evaluationCodeSha: string;
  reconstructedAtUtc: string;
  offlineReconstructionKey: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  sourceMotionRunId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  eventRowContract: string | null;
  assessmentVersion: string;
  assessmentStatus: string;
  evidenceQuality: string | null;
  reasonCodes: unknown;
  inputFingerprint: string;
  motionPin: Ds4Layer2HistoricalExportMotionPinV1;
  evidenceQualityContext: Ds4LongitudinalEvidenceQualityContextV1 | null;
  eventSummariesJson: unknown;
  eventIntensityRecords: readonly Ds4EventIntensityEligibilityRecordV1[];
  longitudinalLoad: ReturnType<typeof projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1>;
};

export function buildDs4Layer2P2OfflineReconstructedRowV1(input: {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  sourceFamily: string | null;
  motionPin: Ds4Layer2HistoricalExportMotionPinV1;
  payload: DiV0MotionCoreShadowPayloadV1;
  evidenceQualityContext: Ds4LongitudinalEvidenceQualityContextV1 | null;
  evaluationCodeSha: string;
  reconstructedAt: Date;
  expectedSpeedAuthority: Ds4SpeedAuthorityPartitionV1;
}): Ds4Layer2P2OfflineReconstructedRowV1 {
  const computed = computeDs4TripAssessmentV1({
    scope: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
    },
    motionRun: {
      id: input.motionPin.motionRunId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      shadowStatus: 'SUCCEEDED',
      pinnedSnapshotHash: input.motionPin.pinnedSnapshotHash,
      combinedInputIdentity: input.motionPin.combinedInputIdentity,
      contentFingerprint: input.motionPin.contentFingerprint,
      createdAt: input.reconstructedAt,
    },
    payload: input.payload,
  });

  if (computed.speedAuthority !== input.expectedSpeedAuthority) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `Trip ${input.tripId}: speed authority ${computed.speedAuthority} !== cohort expected ${input.expectedSpeedAuthority}`,
    );
  }

  const eventRowContract = computed.eventRowContract;
  assertPersistedEventSummariesJsonIntegrityForLayer2ExportV1({
    assessmentId: `OFFLINE_P2:${computed.inputFingerprint}`,
    eventRowContract,
    eventSummariesJson: computed.eventSummaries,
  });

  const longitudinalLoad = projectDs4LongitudinalLoadObservablesV1FromPersistedAssessmentV1({
    assessmentStatus: computed.assessmentStatus,
    evidenceQuality: computed.evidenceQuality,
    speedAuthority: computed.speedAuthority,
    eventSummariesJson: computed.eventSummaries,
    evidenceQualityContext: input.evidenceQualityContext,
  });

  if (longitudinalLoad.reasonCodes.length > 0) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `Trip ${input.tripId}: Layer-2 projector blocked: ${longitudinalLoad.reasonCodes.join(',')}`,
    );
  }

  return {
    reconstructionMode: 'NEWLY_COMPUTED_OFFLINE',
    evaluationCodeSha: input.evaluationCodeSha,
    reconstructedAtUtc: input.reconstructedAt.toISOString(),
    offlineReconstructionKey: computed.inputFingerprint,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    sourceFamily: input.sourceFamily,
    speedAuthority: computed.speedAuthority,
    sourceMotionRunId: input.motionPin.motionRunId,
    pinnedSnapshotHash: input.motionPin.pinnedSnapshotHash,
    combinedInputIdentity: input.motionPin.combinedInputIdentity,
    eventRowContract,
    assessmentVersion: computed.assessmentVersion,
    assessmentStatus: computed.assessmentStatus,
    evidenceQuality: computed.evidenceQuality,
    reasonCodes: computed.reasonCodes,
    inputFingerprint: computed.inputFingerprint,
    motionPin: input.motionPin,
    evidenceQualityContext: input.evidenceQualityContext,
    eventSummariesJson: computed.eventSummaries,
    eventIntensityRecords: computed.eventSummaries.eventIntensityRecords,
    longitudinalLoad,
  };
}

export function assertDs4Layer2P2EventReconciliationV1(row: Ds4Layer2P2OfflineReconstructedRowV1): void {
  const records = row.eventIntensityRecords;
  const admissible = records.filter(
    (r) => r.classification === 'ADMISSIBLE_FULL' || r.classification === 'ADMISSIBLE_BIN_ONLY',
  ).length;
  const unrated = records.filter((r) => r.classification === 'UNRATED').length;
  const excluded = records.filter((r) => r.classification === 'EXCLUDED_ARTEFACT').length;
  if (admissible + unrated + excluded !== records.length) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Trip ${row.tripId}: event intensity reconciliation failed`,
    );
  }
  const indices = records.map((r) => r.eventIndex);
  if (new Set(indices).size !== indices.length) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Trip ${row.tripId}: duplicate event indices in offline reconstruction`,
    );
  }
  if (row.longitudinalLoad.collectionComplete !== true) {
    throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
      `Trip ${row.tripId}: collectionComplete=false for offline reconstruction`,
    );
  }
}
