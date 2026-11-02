import type { PrismaClient } from '@prisma/client';
import { loadDs4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality-context.loader.v1';
import {
  buildAssessmentExportRowV1,
  type Ds4Layer2HistoricalExportAssessmentRowV1,
  Ds4Layer2HistoricalExportIntegrityErrorV1,
  type Ds4Layer2HistoricalExportMotionPinV1,
} from './ds4-layer2-historical-export.v1';
import { Ds4Layer2HistoricalExportReadRepositoryV1 } from './ds4-layer2-historical-export.repository.v1';

export async function loadPersistedDs4Layer2HistoricalExportRowsV1(
  prisma: PrismaClient,
  organizationId: string,
): Promise<Ds4Layer2HistoricalExportAssessmentRowV1[]> {
  const repo = new Ds4Layer2HistoricalExportReadRepositoryV1(prisma);
  const assessments = await repo.loadAssessmentsForOrganization(organizationId);

  const rows: Ds4Layer2HistoricalExportAssessmentRowV1[] = [];
  for (const assessment of assessments) {
    const motion = await repo.loadMotionRunPin({
      motionRunId: assessment.sourceMotionRunId,
      organizationId,
    });
    if (!motion) {
      throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
        `Missing motion run ${assessment.sourceMotionRunId} for assessment ${assessment.id}`,
      );
    }
    if (motion.shadowStatus !== 'SUCCEEDED') {
      throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
        `Motion run ${motion.id} status=${motion.shadowStatus} (expected SUCCEEDED)`,
      );
    }

    const workItem = await repo.loadWorkItemPin({
      workItemId: motion.workItemId,
      organizationId,
      tripId: motion.tripId,
    });
    if (workItem && workItem.organizationId !== organizationId) {
      throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
        `Work item tenancy mismatch for motion ${motion.id}`,
      );
    }

    const motionPin: Ds4Layer2HistoricalExportMotionPinV1 = {
      motionRunId: motion.id,
      organizationId: motion.organizationId,
      vehicleId: motion.vehicleId,
      tripId: motion.tripId,
      pinnedSnapshotHash: motion.pinnedSnapshotHash,
      combinedInputIdentity: motion.combinedInputIdentity,
      shadowBundleVersion: motion.shadowBundleVersion,
      contentFingerprint: motion.contentFingerprint,
      workItemId: motion.workItemId,
      sourceFamily: workItem?.sourceFamily ?? null,
    };

    const evidenceQualityContext = await loadDs4LongitudinalEvidenceQualityContextV1(prisma, {
      organizationId: assessment.organizationId,
      tripId: assessment.tripId,
      pinnedSnapshotHash: assessment.pinnedSnapshotHash,
      sparseChannelOutcome: assessment.evidenceQuality,
    });

    rows.push(
      buildAssessmentExportRowV1({
        assessment,
        motionPin,
        evidenceQualityContext,
      }),
    );
  }
  return rows;
}
