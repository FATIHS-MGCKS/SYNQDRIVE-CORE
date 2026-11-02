import type { PrismaClient } from '@prisma/client';

export type Ds4Layer2P2MotionRunDbRowV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  createdAt: Date;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  shadowBundleVersion: string;
  workItemId: string;
  summaryJson: unknown;
  payloadGzip: Buffer;
};

/** Read-only SQL for P2 offline reconstruction (no writes, no assessment persistence). */
export class Ds4Layer2P2OfflineReconstructionReadRepositoryV1 {
  constructor(private readonly prisma: PrismaClient) {}

  async loadPersistedAssessmentTripIds(organizationId: string): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<Array<{ tripId: string }>>`
      SELECT trip_id AS "tripId"
      FROM di_v0_ds4_trip_assessment_v1
      WHERE organization_id = ${organizationId}
    `;
    return new Set(rows.map((r) => r.tripId));
  }

  async loadSucceededMotionRunsForTrip(input: {
    organizationId: string;
    tripId: string;
  }): Promise<Omit<Ds4Layer2P2MotionRunDbRowV1, 'payloadGzip'>[]> {
    return this.prisma.$queryRaw<
      Omit<Ds4Layer2P2MotionRunDbRowV1, 'payloadGzip'>[]
    >`
      SELECT
        id,
        organization_id AS "organizationId",
        vehicle_id AS "vehicleId",
        trip_id AS "tripId",
        created_at AS "createdAt",
        pinned_snapshot_hash AS "pinnedSnapshotHash",
        combined_input_identity AS "combinedInputIdentity",
        content_fingerprint AS "contentFingerprint",
        shadow_bundle_version AS "shadowBundleVersion",
        work_item_id AS "workItemId",
        summary_json AS "summaryJson"
      FROM di_v0_motion_core_shadow_runs_v1
      WHERE organization_id = ${input.organizationId}
        AND trip_id = ${input.tripId}
        AND shadow_status = 'SUCCEEDED'
      ORDER BY created_at ASC
    `;
  }

  async loadMotionRunPayloadGzip(motionRunId: string, organizationId: string): Promise<Buffer | null> {
    const rows = await this.prisma.$queryRaw<Array<{ payloadGzip: Buffer }>>`
      SELECT payload_gzip AS "payloadGzip"
      FROM di_v0_motion_core_shadow_runs_v1
      WHERE id = ${motionRunId}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;
    return rows[0]?.payloadGzip ?? null;
  }

  async loadWorkItemSourceFamily(input: {
    workItemId: string;
    organizationId: string;
    tripId: string;
  }): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ sourceFamily: string | null }>>`
      SELECT source_family AS "sourceFamily"
      FROM di_v0_s4_work_items
      WHERE id = ${input.workItemId}
        AND organization_id = ${input.organizationId}
        AND trip_id = ${input.tripId}
      LIMIT 1
    `;
    return rows[0]?.sourceFamily ?? null;
  }
}
