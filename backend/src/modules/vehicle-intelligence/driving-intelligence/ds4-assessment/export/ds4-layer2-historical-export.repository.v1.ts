import type { PrismaClient } from '@prisma/client';

/** Read-only explicit SQL for Layer-2 historical export (no Prisma diV0S4* delegates). */
export type Ds4Layer2HistoricalExportAssessmentDbRowV1 = {
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

export type Ds4Layer2HistoricalExportMotionRunPinDbRowV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  shadowBundleVersion: string;
  contentFingerprint: string;
  workItemId: string;
  shadowStatus: string;
};

export type Ds4Layer2HistoricalExportWorkItemPinDbRowV1 = {
  sourceFamily: string | null;
  organizationId: string;
  tripId: string;
};

export class Ds4Layer2HistoricalExportReadRepositoryV1 {
  constructor(private readonly prisma: PrismaClient) {}

  async loadAssessmentsForOrganization(
    organizationId: string,
  ): Promise<Ds4Layer2HistoricalExportAssessmentDbRowV1[]> {
    return this.prisma.$queryRaw<Ds4Layer2HistoricalExportAssessmentDbRowV1[]>`
      SELECT
        id,
        organization_id AS "organizationId",
        vehicle_id AS "vehicleId",
        trip_id AS "tripId",
        assessment_version AS "assessmentVersion",
        assessment_status AS "assessmentStatus",
        input_fingerprint AS "inputFingerprint",
        source_motion_run_id AS "sourceMotionRunId",
        pinned_snapshot_hash AS "pinnedSnapshotHash",
        combined_input_identity AS "combinedInputIdentity",
        event_row_contract AS "eventRowContract",
        speed_authority AS "speedAuthority",
        evidence_quality AS "evidenceQuality",
        reason_codes AS "reasonCodes",
        computed_at AS "computedAt",
        event_summaries_json AS "eventSummariesJson"
      FROM di_v0_ds4_trip_assessment_v1
      WHERE organization_id = ${organizationId}
      ORDER BY vehicle_id ASC, trip_id ASC, input_fingerprint ASC
    `;
  }

  async loadMotionRunPin(scope: {
    motionRunId: string;
    organizationId: string;
  }): Promise<Ds4Layer2HistoricalExportMotionRunPinDbRowV1 | null> {
    const rows = await this.prisma.$queryRaw<Ds4Layer2HistoricalExportMotionRunPinDbRowV1[]>`
      SELECT
        id,
        organization_id AS "organizationId",
        vehicle_id AS "vehicleId",
        trip_id AS "tripId",
        pinned_snapshot_hash AS "pinnedSnapshotHash",
        combined_input_identity AS "combinedInputIdentity",
        shadow_bundle_version AS "shadowBundleVersion",
        content_fingerprint AS "contentFingerprint",
        work_item_id AS "workItemId",
        shadow_status AS "shadowStatus"
      FROM di_v0_motion_core_shadow_runs_v1
      WHERE id = ${scope.motionRunId}
        AND organization_id = ${scope.organizationId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async loadWorkItemPin(scope: {
    workItemId: string;
    organizationId: string;
    tripId: string;
  }): Promise<Ds4Layer2HistoricalExportWorkItemPinDbRowV1 | null> {
    const rows = await this.prisma.$queryRaw<Ds4Layer2HistoricalExportWorkItemPinDbRowV1[]>`
      SELECT
        source_family AS "sourceFamily",
        organization_id AS "organizationId",
        trip_id AS "tripId"
      FROM di_v0_s4_work_items
      WHERE id = ${scope.workItemId}
        AND organization_id = ${scope.organizationId}
        AND trip_id = ${scope.tripId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
