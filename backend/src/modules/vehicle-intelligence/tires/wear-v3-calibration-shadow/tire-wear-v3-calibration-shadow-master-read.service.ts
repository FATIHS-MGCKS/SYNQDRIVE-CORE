import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  hasRotationDuringMountPeriod,
  resolveActiveMountPeriod,
} from '../wear-v3-prior/tire-wear-v3-prior.lifecycle';
import {
  evaluateTireWearV3CalibrationPairing,
  selectLatestProspectiveSnapshotBeforeMeasurement,
  type TireWearV3CalibrationMeasurementRef,
  type TireWearV3CalibrationSnapshotRef,
} from './tire-wear-v3-calibration-pairing.policy';
import {
  buildSnapshotListKeysetWhere,
  decodeSnapshotListCursor,
  encodeSnapshotListCursor,
  sanitizeCalibrationSnapshotPayloadForMasterRead,
} from './tire-wear-v3-calibration-center-read.util';
import {
  TIRE_CALIBRATION_CENTER_DEFAULT_PAGE_SIZE,
  TIRE_CALIBRATION_CENTER_MAX_PAGE_SIZE,
  type TireCalibrationGlobalSummaryDto,
  type TireCalibrationOrgRollupPageDto,
  type TireCalibrationSetupListDto,
  type TireCalibrationSnapshotDetailDto,
  type TireCalibrationSnapshotListPageDto,
  type TireCalibrationSetupInspectionDto,
  type TireCalibrationVehicleRollupPageDto,
  type TireCalibrationWriterHealthDto,
} from './tire-wear-v3-calibration-center-read.types';
import { TireWearV3CalibrationSnapshotRepository } from './tire-wear-v3-calibration-snapshot.repository';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';
import type {
  TireWearV3CalibrationPairingRejectionReason,
  TireWearV3CalibrationSnapshotPayload,
} from './tire-wear-v3-calibration-snapshot.types';

@Injectable()
export class TireWearV3CalibrationShadowMasterReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: TireWearV3CalibrationSnapshotRepository,
    private readonly writer: TireWearV3CalibrationShadowWriterService,
  ) {}

  getWriterHealth(): TireCalibrationWriterHealthDto {
    const stats = this.writer.getWriterStats();
    return {
      writeEnabled: this.writer.isWriteEnabled(),
      telemetryScope: 'REPLICA_LOCAL',
      lastTickAt: stats.lastTickAt,
      lastResult: stats.lastResult,
      lastError: stats.lastError,
      lastCandidateSetups: stats.lastCandidateSetups,
      lastSnapshotsInserted: stats.lastSnapshotsInserted,
      lastSnapshotsExisting: stats.lastSnapshotsExisting,
      lastSetupsSkipped: stats.lastSetupsSkipped,
    };
  }

  async getGlobalSummary(): Promise<TireCalibrationGlobalSummaryDto> {
    const [snapshotCount, setupCount, latest] = await Promise.all([
      this.prisma.tireWearV3CalibrationSnapshotV1.count(),
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['tireSetupId'],
        _count: { _all: true },
      }),
      this.prisma.tireWearV3CalibrationSnapshotV1.findFirst({
        orderBy: { predictionCreatedAt: 'desc' },
        select: { predictionCreatedAt: true, tireSetupId: true, organizationId: true },
      }),
    ]);

    return {
      snapshotRowCount: snapshotCount,
      setupCountWithSnapshots: setupCount.length,
      latestSnapshotAt: latest?.predictionCreatedAt?.toISOString() ?? null,
      latestSnapshotSetupId: latest?.tireSetupId ?? null,
      latestSnapshotOrganizationId: latest?.organizationId ?? null,
      writer: this.getWriterHealth(),
    };
  }

  async getSetupInspection(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }) {
    const scopedCount = await this.prisma.tireWearV3CalibrationSnapshotV1.count({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
    });

    const latestAt = await this.snapshots.latestSnapshotTimestampForSetup(
      args.tireSetupId,
    );

    const recent = await this.snapshots.listRecentSnapshotsForSetup({
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      limit: 20,
    });

    const pairingSummary = await this.summarizePairingForSetup(args);

    return {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      snapshotCount: scopedCount,
      latestSnapshotAt: latestAt?.toISOString() ?? null,
      recentSnapshots: recent,
      pairing: pairingSummary,
      writer: this.getWriterHealth(),
    };
  }

  private async summarizePairingForSetup(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }) {
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: {
        id: args.tireSetupId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
      },
      select: {
        organizationId: true,
        mountPeriods: {
          select: {
            id: true,
            installedAt: true,
            removedAt: true,
            installedOdometerKm: true,
            odometerAnchorStatus: true,
          },
          orderBy: { installedAt: 'asc' },
        },
        installedAt: true,
        removedAt: true,
        installedOdometerKm: true,
        odometerAnchorStatus: true,
      },
    });
    if (!setup) {
      return {
        pairableCount: 0,
        rejectionCounts: {},
        sampledMeasurements: 0,
        scope: 'SAMPLED_POLICY_REEVALUATION' as const,
      };
    }

    const measurements = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: {
        tireSetupId: args.tireSetupId,
        vehicleId: args.vehicleId,
      },
      orderBy: { measuredAt: 'desc' },
      take: 40,
      select: {
        id: true,
        vehicleId: true,
        tireSetupId: true,
        measuredAt: true,
        odometerAtMeasurement: true,
        evidenceSource: true,
        frontLeftMm: true,
        frontRightMm: true,
        rearLeftMm: true,
        rearRightMm: true,
      },
    });

    const snapshotRows = await this.prisma.tireWearV3CalibrationSnapshotV1.findMany({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tireSetupId: true,
        mountPeriodId: true,
        wheelPosition: true,
        physicalTireId: true,
        predictionCreatedAt: true,
        sourceComputedAt: true,
        sourceDataCutoffAt: true,
        sourceOdometerKm: true,
        latestSourceMeasurementAt: true,
        measurementIdsUsed: true,
        pairingEligible: true,
      },
    });

    const snapshots: TireWearV3CalibrationSnapshotRef[] = snapshotRows.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      vehicleId: s.vehicleId,
      tireSetupId: s.tireSetupId,
      mountPeriodId: s.mountPeriodId,
      wheelPosition: s.wheelPosition,
      physicalTireId: s.physicalTireId,
      predictionCreatedAt: s.predictionCreatedAt,
      sourceComputedAt: s.sourceComputedAt,
      sourceDataCutoffAt: s.sourceDataCutoffAt,
      sourceOdometerKm: s.sourceOdometerKm,
      latestSourceMeasurementAt: s.latestSourceMeasurementAt,
      measurementIdsUsed: Array.isArray(s.measurementIdsUsed)
        ? (s.measurementIdsUsed as string[])
        : [],
      pairingEligible: s.pairingEligible,
    }));

    const rejectionCounts: Partial<
      Record<TireWearV3CalibrationPairingRejectionReason, number>
    > = {};
    let pairableCount = 0;
    const wheels: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

    const rotationEvents = await this.prisma.tirePositionHistory.findMany({
      where: { tireSetId: args.tireSetupId },
      select: { changedAt: true },
    });

    for (const m of measurements) {
      const measurementRef: TireWearV3CalibrationMeasurementRef = {
        id: m.id,
        organizationId: setup.organizationId,
        vehicleId: m.vehicleId,
        tireSetupId: m.tireSetupId,
        measuredAt: m.measuredAt,
        odometerAtMeasurement: m.odometerAtMeasurement,
        evidenceSource: m.evidenceSource,
        treadMmByWheel: {
          FL: m.frontLeftMm,
          FR: m.frontRightMm,
          RL: m.rearLeftMm,
          RR: m.rearRightMm,
        },
      };

      const mountPeriod = resolveActiveMountPeriod(
        setup.mountPeriods,
        m.measuredAt,
        {
          installedAt: setup.installedAt,
          removedAt: setup.removedAt,
          installedOdometerKm: setup.installedOdometerKm,
          odometerAnchorStatus: setup.odometerAnchorStatus,
        },
      );
      const rotationDuringMountPeriod =
        mountPeriod != null
          ? hasRotationDuringMountPeriod(rotationEvents, mountPeriod)
          : false;

      for (const wheel of wheels) {
        const snapshot = selectLatestProspectiveSnapshotBeforeMeasurement(
          snapshots,
          measurementRef,
          wheel,
        );
        const evalResult = evaluateTireWearV3CalibrationPairing({
          snapshot,
          measurement: measurementRef,
          wheel,
          mountPeriod,
          rotationDuringMountPeriod,
        });
        if (evalResult.eligible) pairableCount += 1;
        else if (evalResult.rejectionReason) {
          rejectionCounts[evalResult.rejectionReason] =
            (rejectionCounts[evalResult.rejectionReason] ?? 0) + 1;
        }
      }
    }

    return {
      pairableCount,
      rejectionCounts,
      sampledMeasurements: measurements.length,
      scope: 'SAMPLED_POLICY_REEVALUATION' as const,
    };
  }

  clampPageLimit(limit?: number): number {
    const raw = limit ?? TIRE_CALIBRATION_CENTER_DEFAULT_PAGE_SIZE;
    return Math.min(TIRE_CALIBRATION_CENTER_MAX_PAGE_SIZE, Math.max(1, raw));
  }

  async listOrganizationsWithSnapshots(args: {
    limit?: number;
    offset?: number;
  }): Promise<TireCalibrationOrgRollupPageDto> {
    const limit = this.clampPageLimit(args.limit);
    const offset = Math.max(0, args.offset ?? 0);

    const [totalGroups, rows] = await Promise.all([
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['organizationId'],
        _count: { _all: true },
      }),
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['organizationId'],
        _count: { _all: true },
        _max: { predictionCreatedAt: true },
        orderBy: { _max: { predictionCreatedAt: 'desc' } },
        skip: offset,
        take: limit,
      }),
    ]);

    const orgIds = rows.map((r) => r.organizationId);
    const setupCounts =
      orgIds.length === 0
        ? []
        : await this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
            by: ['organizationId', 'tireSetupId'],
            where: { organizationId: { in: orgIds } },
            _count: { _all: true },
          });

    const setupsByOrg = new Map<string, number>();
    for (const row of setupCounts) {
      setupsByOrg.set(row.organizationId, (setupsByOrg.get(row.organizationId) ?? 0) + 1);
    }

    return {
      items: rows.map((r) => ({
        organizationId: r.organizationId,
        snapshotCount: r._count._all,
        setupCount: setupsByOrg.get(r.organizationId) ?? 0,
        latestSnapshotAt: r._max.predictionCreatedAt?.toISOString() ?? null,
      })),
      total: totalGroups.length,
      limit,
      offset,
    };
  }

  async listVehiclesWithSnapshots(args: {
    organizationId: string;
    limit?: number;
    offset?: number;
  }): Promise<TireCalibrationVehicleRollupPageDto> {
    const limit = this.clampPageLimit(args.limit);
    const offset = Math.max(0, args.offset ?? 0);

    const where = { organizationId: args.organizationId };

    const [totalGroups, rows] = await Promise.all([
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['vehicleId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['vehicleId'],
        where,
        _count: { _all: true },
        _max: { predictionCreatedAt: true },
        orderBy: { _max: { predictionCreatedAt: 'desc' } },
        skip: offset,
        take: limit,
      }),
    ]);

    const vehicleIds = rows.map((r) => r.vehicleId);
    const setupCounts =
      vehicleIds.length === 0
        ? []
        : await this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
            by: ['vehicleId', 'tireSetupId'],
            where: { organizationId: args.organizationId, vehicleId: { in: vehicleIds } },
            _count: { _all: true },
          });

    const setupsByVehicle = new Map<string, number>();
    for (const row of setupCounts) {
      setupsByVehicle.set(row.vehicleId, (setupsByVehicle.get(row.vehicleId) ?? 0) + 1);
    }

    return {
      organizationId: args.organizationId,
      items: rows.map((r) => ({
        vehicleId: r.vehicleId,
        snapshotCount: r._count._all,
        setupCount: setupsByVehicle.get(r.vehicleId) ?? 0,
        latestSnapshotAt: r._max.predictionCreatedAt?.toISOString() ?? null,
      })),
      total: totalGroups.length,
      limit,
      offset,
    };
  }

  async listSetupsForVehicle(args: {
    organizationId: string;
    vehicleId: string;
  }): Promise<TireCalibrationSetupListDto> {
    await this.assertVehicleInOrganization(args.organizationId, args.vehicleId);

    const rows = await this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
      by: ['tireSetupId'],
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
      },
      _count: { _all: true },
      _max: { predictionCreatedAt: true },
      orderBy: { _max: { predictionCreatedAt: 'desc' } },
    });

    const setupIds = rows.map((r) => r.tireSetupId);
    const wheelGroups =
      setupIds.length === 0
        ? []
        : await this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
            by: ['tireSetupId', 'wheelPosition'],
            where: {
              organizationId: args.organizationId,
              vehicleId: args.vehicleId,
              tireSetupId: { in: setupIds },
            },
            _count: { _all: true },
          });

    const mountGroups =
      setupIds.length === 0
        ? []
        : await this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
            by: ['tireSetupId', 'mountPeriodId'],
            where: {
              organizationId: args.organizationId,
              vehicleId: args.vehicleId,
              tireSetupId: { in: setupIds },
            },
            _count: { _all: true },
          });

    const wheelsBySetup = new Map<string, Set<string>>();
    for (const g of wheelGroups) {
      const set = wheelsBySetup.get(g.tireSetupId) ?? new Set<string>();
      set.add(g.wheelPosition);
      wheelsBySetup.set(g.tireSetupId, set);
    }

    const mountsBySetup = new Map<string, Set<string>>();
    for (const g of mountGroups) {
      if (g.mountPeriodId == null) continue;
      const set = mountsBySetup.get(g.tireSetupId) ?? new Set<string>();
      set.add(g.mountPeriodId);
      mountsBySetup.set(g.tireSetupId, set);
    }

    return {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      items: rows.map((r) => ({
        tireSetupId: r.tireSetupId,
        snapshotCount: r._count._all,
        latestSnapshotAt: r._max.predictionCreatedAt?.toISOString() ?? null,
        wheelPositions: [...(wheelsBySetup.get(r.tireSetupId) ?? new Set())].sort(),
        mountPeriodIds: [...(mountsBySetup.get(r.tireSetupId) ?? new Set())].sort(),
      })),
    };
  }

  async listSnapshotsForSetup(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    wheelPosition?: string;
    mountPeriodId?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<TireCalibrationSnapshotListPageDto> {
    await this.assertSetupScope(args);

    const limit = this.clampPageLimit(args.limit);
    const cursor = args.cursor ? decodeSnapshotListCursor(args.cursor) : null;

    const where = buildSnapshotListKeysetWhere({
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      wheelPosition: args.wheelPosition,
      mountPeriodId: args.mountPeriodId,
      cursor,
    });

    const rows = await this.prisma.tireWearV3CalibrationSnapshotV1.findMany({
      where,
      orderBy: [{ predictionCreatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        wheelPosition: true,
        mountPeriodId: true,
        physicalTireId: true,
        predictionCreatedAt: true,
        sourceComputedAt: true,
        pairingEligible: true,
        modelVersion: true,
        snapshotSchemaVersion: true,
        sourceOdometerKm: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeSnapshotListCursor({
            predictionCreatedAt: page[page.length - 1]!.predictionCreatedAt,
            id: page[page.length - 1]!.id,
          })
        : null;

    return {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      items: page.map((r) => ({
        id: r.id,
        wheelPosition: r.wheelPosition,
        mountPeriodId: r.mountPeriodId,
        physicalTireId: r.physicalTireId,
        predictionCreatedAt: r.predictionCreatedAt.toISOString(),
        sourceComputedAt: r.sourceComputedAt.toISOString(),
        pairingEligible: r.pairingEligible,
        modelVersion: r.modelVersion,
        snapshotSchemaVersion: r.snapshotSchemaVersion,
        sourceOdometerKm: r.sourceOdometerKm,
      })),
      nextCursor,
      limit,
    };
  }

  async getSnapshotDetail(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    snapshotId: string;
  }): Promise<TireCalibrationSnapshotDetailDto> {
    await this.assertSetupScope(args);

    const row = await this.prisma.tireWearV3CalibrationSnapshotV1.findFirst({
      where: {
        id: args.snapshotId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
    });

    if (!row) {
      throw new NotFoundException('Calibration snapshot not found for scope');
    }

    const payload = sanitizeCalibrationSnapshotPayloadForMasterRead(
      row.snapshotPayload as unknown as TireWearV3CalibrationSnapshotPayload,
    );
    const physicalIdentityStatus =
      row.physicalTireId != null &&
      payload?.prediction?.physicalIdentityAmbiguous !== true
        ? ('CONFIRMED' as const)
        : ('UNCONFIRMED' as const);

    return {
      id: row.id,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tireSetupId: row.tireSetupId,
      mountPeriodId: row.mountPeriodId,
      wheelPosition: row.wheelPosition,
      physicalTireId: row.physicalTireId,
      physicalIdentityStatus,
      predictionCreatedAt: row.predictionCreatedAt.toISOString(),
      sourceComputedAt: row.sourceComputedAt.toISOString(),
      sourceDataCutoffAt: row.sourceDataCutoffAt.toISOString(),
      sourceOdometerKm: row.sourceOdometerKm,
      latestSourceMeasurementAt: row.latestSourceMeasurementAt?.toISOString() ?? null,
      modelVersion: row.modelVersion,
      modelConfigHash: row.modelConfigHash,
      snapshotSchemaVersion: row.snapshotSchemaVersion,
      calibrationEligibilityDigestPrefix: row.calibrationEligibilityDigest.slice(0, 12),
      inputFingerprintPrefix: row.inputFingerprint.slice(0, 12),
      pairingEligible: row.pairingEligible,
      measurementIdsUsed: Array.isArray(row.measurementIdsUsed)
        ? (row.measurementIdsUsed as string[])
        : [],
      payload,
    };
  }

  async getSetupQualityInspection(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }): Promise<TireCalibrationSetupInspectionDto> {
    await this.assertSetupScope(args);

    const scopedCount = await this.prisma.tireWearV3CalibrationSnapshotV1.count({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
    });

    const latestAt = await this.snapshots.latestSnapshotTimestampForSetup(args.tireSetupId);
    const pairingSummary = await this.summarizePairingForSetup(args);

    return {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      snapshotCount: scopedCount,
      latestSnapshotAt: latestAt?.toISOString() ?? null,
      pairing: {
        pairableCount: pairingSummary.pairableCount,
        rejectionCounts: pairingSummary.rejectionCounts,
        sampledMeasurements: pairingSummary.sampledMeasurements,
        scope: 'SAMPLED_POLICY_REEVALUATION',
      },
      writer: this.getWriterHealth(),
    };
  }

  private async assertVehicleInOrganization(
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }

  private async assertSetupScope(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }): Promise<void> {
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: {
        id: args.tireSetupId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
      },
      select: { id: true },
    });
    if (!setup) {
      throw new NotFoundException('Tire setup not found for organization and vehicle');
    }
  }
}
