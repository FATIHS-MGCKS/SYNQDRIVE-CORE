import type { PrismaClient } from '@prisma/client';
import { loadDs4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality-context.loader.v1';
import {
  assertDs4Layer2P2CohortScopeMatchesRuntimeV1,
  assertDs4Layer2P2PilotCohortIntegrityV1,
  DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1,
  DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1,
} from './ds4-layer2-p2-offline-reconstruction.cohort.v1';
import { Ds4Layer2P2OfflineReconstructionReadRepositoryV1 } from './ds4-layer2-p2-offline-reconstruction.repository.v1';
import {
  assertDs4Layer2P2EventReconciliationV1,
  buildDs4Layer2P2OfflineReconstructedRowV1,
  decodeMotionCoreShadowPayloadGzipV1,
  Ds4Layer2P2OfflineReconstructionErrorV1,
  evaluateDs4Layer2P2MotionRevisionCandidateV1,
  resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1,
  type Ds4Layer2P2OfflineReconstructedRowV1,
} from './ds4-layer2-p2-offline-reconstruction.v1';
import {
  selectDs4Layer2P2MotionRevisionV1,
  type Ds4Layer2P2RevisionSelectionRowV1,
} from './ds4-layer2-p2-offline-reconstruction.revision-selector.v1';
import type { Ds4Layer2HistoricalExportMotionPinV1 } from './ds4-layer2-historical-export.v1';

export type Ds4Layer2P2OfflinePilotLoadResultV1 = {
  organizationId: string;
  revisionSelectionPolicy: string;
  rows: Ds4Layer2P2OfflineReconstructedRowV1[];
  revisionRows: Ds4Layer2P2RevisionSelectionRowV1[];
};

export async function loadDs4Layer2P2OfflinePilotReconstructionRowsV1(
  prisma: PrismaClient,
  organizationId: string,
  input: { evaluationCodeSha: string; reconstructedAt: Date },
): Promise<Ds4Layer2P2OfflinePilotLoadResultV1> {
  assertDs4Layer2P2PilotCohortIntegrityV1();

  if (organizationId !== DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1(
      `P2 pilot is scoped to organization ${DS4_LAYER2_P2_OFFLINE_PILOT_ORGANIZATION_ID_V1} only`,
    );
  }

  const repo = new Ds4Layer2P2OfflineReconstructionReadRepositoryV1(prisma);
  const persistedTrips = await repo.loadPersistedAssessmentTripIds(organizationId);

  for (const entry of DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1) {
    if (persistedTrips.has(entry.tripId)) {
      throw new Ds4Layer2P2OfflineReconstructionErrorV1(
        `Trip ${entry.tripId} has persisted P1 assessment — excluded from P2 pilot`,
      );
    }
  }

  const rows: Ds4Layer2P2OfflineReconstructedRowV1[] = [];
  const revisionRows: Ds4Layer2P2RevisionSelectionRowV1[] = [];
  let revisionSelectionPolicy = '';

  for (const entry of DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1) {
    const runMetas = await repo.loadSucceededMotionRunsForTrip({
      organizationId,
      tripId: entry.tripId,
    });
    if (runMetas.length === 0) {
      throw new Ds4Layer2P2OfflineReconstructionErrorV1(`No SUCCEEDED motion runs for trip ${entry.tripId}`);
    }

    for (const meta of runMetas) {
      if (meta.tripId !== entry.tripId || meta.vehicleId !== entry.expectedVehicleId) {
        throw new Ds4Layer2P2OfflineReconstructionErrorV1(
          `Motion run scope mismatch for trip ${entry.tripId}: vehicleId=${meta.vehicleId}`,
        );
      }
    }

    const candidates = [];
    for (const meta of runMetas) {
      const payloadGzip = await repo.loadMotionRunPayloadGzip(meta.id, organizationId);
      candidates.push(
        evaluateDs4Layer2P2MotionRevisionCandidateV1({
          motionRunId: meta.id,
          createdAt: meta.createdAt,
          pinnedSnapshotHash: meta.pinnedSnapshotHash,
          combinedInputIdentity: meta.combinedInputIdentity,
          contentFingerprint: meta.contentFingerprint,
          summaryJson: meta.summaryJson,
          payloadGzip,
          scope: {
            organizationId,
            vehicleId: meta.vehicleId,
            tripId: meta.tripId,
          },
        }),
      );
    }

    const selection = selectDs4Layer2P2MotionRevisionV1({
      tripId: entry.tripId,
      candidates,
    });
    revisionSelectionPolicy = selection.selectionPolicy;
    revisionRows.push(...selection.rows);

    const selectedMeta = runMetas.find((m) => m.id === selection.selected.motionRunId);
    if (!selectedMeta) {
      throw new Ds4Layer2P2OfflineReconstructionErrorV1(
        `Selected motion run missing for trip ${entry.tripId}`,
      );
    }

    const payloadGzip = await repo.loadMotionRunPayloadGzip(selectedMeta.id, organizationId);
    const { payload, corrupt } = decodeMotionCoreShadowPayloadGzipV1(payloadGzip);
    if (!payload || corrupt) {
      throw new Ds4Layer2P2OfflineReconstructionErrorV1(
        `Selected motion payload corrupt for trip ${entry.tripId}`,
      );
    }

    const sourceFamily = await repo.loadWorkItemSourceFamily({
      workItemId: selectedMeta.workItemId,
      organizationId,
      tripId: entry.tripId,
    });

    assertDs4Layer2P2CohortScopeMatchesRuntimeV1({
      entry,
      organizationId,
      vehicleId: selectedMeta.vehicleId,
      tripId: entry.tripId,
      sourceFamily,
      speedAuthority: selection.selected.speedAuthority,
    });

    const sparseChannelOutcome = resolveDs4Layer2P2SparseChannelOutcomeFromMotionPayloadV1(payload);

    const motionPin: Ds4Layer2HistoricalExportMotionPinV1 = {
      motionRunId: selectedMeta.id,
      organizationId,
      vehicleId: selectedMeta.vehicleId,
      tripId: entry.tripId,
      pinnedSnapshotHash: selectedMeta.pinnedSnapshotHash,
      combinedInputIdentity: selectedMeta.combinedInputIdentity,
      shadowBundleVersion: selectedMeta.shadowBundleVersion,
      contentFingerprint: selectedMeta.contentFingerprint,
      workItemId: selectedMeta.workItemId,
      sourceFamily,
    };

    const evidenceQualityContext = await loadDs4LongitudinalEvidenceQualityContextV1(prisma, {
      organizationId,
      tripId: entry.tripId,
      pinnedSnapshotHash: selectedMeta.pinnedSnapshotHash,
      sparseChannelOutcome,
    });

    const row = buildDs4Layer2P2OfflineReconstructedRowV1({
      organizationId,
      vehicleId: selectedMeta.vehicleId,
      tripId: entry.tripId,
      sourceFamily,
      motionPin,
      payload,
      evidenceQualityContext,
      evaluationCodeSha: input.evaluationCodeSha,
      reconstructedAt: input.reconstructedAt,
      expectedSpeedAuthority: entry.expectedSpeedAuthority,
    });

    assertDs4Layer2P2EventReconciliationV1(row);
    rows.push(row);
  }

  if (rows.length !== DS4_LAYER2_P2_OFFLINE_PILOT_COHORT_V1.length) {
    throw new Ds4Layer2P2OfflineReconstructionErrorV1('P2 pilot row count mismatch');
  }

  return {
    organizationId,
    revisionSelectionPolicy,
    rows,
    revisionRows,
  };
}
