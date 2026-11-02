import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { TireWearV3CalibrationSnapshotInsertRow } from './tire-wear-v3-calibration-snapshot.types';

export type TireWearV3CalibrationSetupCandidate = {
  tireSetupId: string;
  organizationId: string;
};

@Injectable()
export class TireWearV3CalibrationSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSetupCandidatesForSnapshotBatch(
    limit: number,
  ): Promise<TireWearV3CalibrationSetupCandidate[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ tire_setup_id: string; organization_id: string }>
    >(
      Prisma.sql`
        SELECT s.id AS tire_setup_id, s.organization_id AS organization_id
        FROM vehicle_tire_setups s
        WHERE s.removed_at IS NULL
          AND s.organization_id IS NOT NULL
        ORDER BY (
          SELECT MAX(c.prediction_created_at)
          FROM tire_wear_v3_calibration_snapshot_v1 c
          WHERE c.tire_setup_id = s.id
        ) ASC NULLS FIRST
        LIMIT ${limit}
      `,
    );
    return rows.map((r) => ({
      tireSetupId: r.tire_setup_id,
      organizationId: r.organization_id,
    }));
  }

  async findLatestCalibrationEligibilityDigest(
    tireSetupId: string,
    organizationId: string,
  ): Promise<string | null> {
    const row = await this.prisma.tireWearV3CalibrationSnapshotV1.findFirst({
      where: { tireSetupId, organizationId },
      orderBy: { predictionCreatedAt: 'desc' },
      select: { calibrationEligibilityDigest: true },
    });
    return row?.calibrationEligibilityDigest ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.tireWearV3CalibrationSnapshotV1.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
  }

  async insertSnapshotIdempotent(row: TireWearV3CalibrationSnapshotInsertRow): Promise<{
    id: string;
    created: boolean;
  }> {
    const existing = await this.findByIdempotencyKey(row.idempotencyKey);
    if (existing) {
      return { id: existing.id, created: false };
    }

    try {
      const created = await this.prisma.tireWearV3CalibrationSnapshotV1.create({
        data: {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          tireSetupId: row.tireSetupId,
          mountPeriodId: row.mountPeriodId,
          wheelPosition: row.wheelPosition,
          physicalTireId: row.physicalTireId,
          predictionCreatedAt: row.predictionCreatedAt,
          sourceComputedAt: row.sourceComputedAt,
          sourceOdometerKm: row.sourceOdometerKm,
          modelVersion: row.modelVersion,
          modelConfigHash: row.modelConfigHash,
          inputFingerprint: row.inputFingerprint,
          calibrationEligibilityDigest: row.calibrationEligibilityDigest,
          snapshotSchemaVersion: row.snapshotSchemaVersion,
          idempotencyKey: row.idempotencyKey,
          latestSourceMeasurementAt: row.latestSourceMeasurementAt,
          sourceDataCutoffAt: row.sourceDataCutoffAt,
          pairingEligible: row.pairingEligible,
          measurementIdsUsed: row.measurementIdsUsed,
          snapshotPayload: row.snapshotPayload as object,
        },
        select: { id: true },
      });
      return { id: created.id, created: true };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const again = await this.findByIdempotencyKey(row.idempotencyKey);
        if (again) return { id: again.id, created: false };
      }
      throw err;
    }
  }

  async countSnapshotsForOrganization(organizationId: string): Promise<number> {
    return this.prisma.tireWearV3CalibrationSnapshotV1.count({
      where: { organizationId },
    });
  }

  async countSnapshotsForSetup(tireSetupId: string): Promise<number> {
    return this.prisma.tireWearV3CalibrationSnapshotV1.count({
      where: { tireSetupId },
    });
  }

  async latestSnapshotTimestampForSetup(
    tireSetupId: string,
  ): Promise<Date | null> {
    const row = await this.prisma.tireWearV3CalibrationSnapshotV1.findFirst({
      where: { tireSetupId },
      orderBy: { predictionCreatedAt: 'desc' },
      select: { predictionCreatedAt: true },
    });
    return row?.predictionCreatedAt ?? null;
  }

  async listRecentSnapshotsForSetup(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    limit: number;
  }) {
    return this.prisma.tireWearV3CalibrationSnapshotV1.findMany({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
      orderBy: { predictionCreatedAt: 'desc' },
      take: args.limit,
      select: {
        id: true,
        wheelPosition: true,
        mountPeriodId: true,
        predictionCreatedAt: true,
        sourceComputedAt: true,
        sourceDataCutoffAt: true,
        inputFingerprint: true,
        calibrationEligibilityDigest: true,
        pairingEligible: true,
        modelVersion: true,
        snapshotSchemaVersion: true,
      },
    });
  }
}
