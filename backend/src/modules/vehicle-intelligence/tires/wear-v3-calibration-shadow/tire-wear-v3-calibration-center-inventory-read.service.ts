import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WheelPos } from '../tire-evidence-provenance';
import { dbPosToWheel } from '../tire-identity.service';
import type { TireWearV3PriorSetupResult } from '../wear-v3-prior/tire-wear-v3-prior.types';
import { resolveActiveMountPeriod } from '../wear-v3-prior/tire-wear-v3-prior.lifecycle';
import { TireWearV3CalibrationEligibilityService } from './tire-wear-v3-calibration-eligibility.service';
import {
  TIRE_CALIBRATION_CENTER_DEFAULT_PAGE_SIZE,
  TIRE_CALIBRATION_CENTER_MAX_PAGE_SIZE,
} from './tire-wear-v3-calibration-center-read.types';
import type {
  TireInventoryCalibrationEligibilityReadDto,
  TireInventoryDs4ReadDto,
  TireInventoryGlobalSummaryDto,
  TireInventoryOrgRollupPageDto,
  TireInventoryPhysicalIdentityStatus,
  TireInventoryPriorShadowReadDto,
  TireInventorySetupDetailDto,
  TireInventorySetupListDto,
  TireInventoryVehicleRollupPageDto,
  TireInventoryWheelAssignmentDto,
  TireInventoryWheelMeasurementDto,
} from './tire-wear-v3-calibration-center-inventory.types';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';

const WHEELS: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

function wheelPhysicalStatus(
  tireId: string | null,
  wheelAmbiguous: boolean,
): TireInventoryPhysicalIdentityStatus {
  if (wheelAmbiguous) return 'AMBIGUOUS';
  if (tireId) return 'CONFIRMED';
  return 'UNCONFIRMED';
}

function treadFromSetupMeasurement(
  m: {
    id: string;
    measuredAt: Date;
    evidenceSource: string | null;
    source: string;
    frontLeftMm: number | null;
    frontRightMm: number | null;
    rearLeftMm: number | null;
    rearRightMm: number | null;
  } | null,
  wheel: WheelPos,
): TireInventoryWheelMeasurementDto {
  if (!m) {
    return {
      wheelPosition: wheel,
      treadDepthMm: null,
      measuredAt: null,
      measurementId: null,
      evidenceSource: null,
      source: null,
      availability: 'NOT_RECORDED',
    };
  }
  const treadDepthMm =
    wheel === 'FL'
      ? m.frontLeftMm
      : wheel === 'FR'
        ? m.frontRightMm
        : wheel === 'RL'
          ? m.rearLeftMm
          : m.rearRightMm;
  return {
    wheelPosition: wheel,
    treadDepthMm,
    measuredAt: m.measuredAt.toISOString(),
    measurementId: m.id,
    evidenceSource: m.evidenceSource,
    source: m.source,
    availability: treadDepthMm != null ? 'AVAILABLE' : 'NOT_RECORDED',
  };
}

@Injectable()
export class TireWearV3CalibrationCenterInventoryReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: TireWearV3CalibrationEligibilityService,
    private readonly writer: TireWearV3CalibrationShadowWriterService,
  ) {}

  clampPageLimit(limit?: number): number {
    const raw = limit ?? TIRE_CALIBRATION_CENTER_DEFAULT_PAGE_SIZE;
    return Math.min(TIRE_CALIBRATION_CENTER_MAX_PAGE_SIZE, Math.max(1, raw));
  }

  async getGlobalSummary(): Promise<TireInventoryGlobalSummaryDto> {
    const setupWhere = { organizationId: { not: null } };

    const [
      orgGroups,
      vehicleGroups,
      registeredSetupCount,
      setupsWithTreadMeasurements,
      setupsWithPriorShadowRows,
      setupsWithCalibrationSnapshots,
      activeTires,
    ] = await Promise.all([
      this.prisma.vehicleTireSetup.groupBy({
        by: ['organizationId'],
        where: setupWhere,
      }),
      this.prisma.vehicleTireSetup.groupBy({
        by: ['vehicleId'],
        where: setupWhere,
      }),
      this.prisma.vehicleTireSetup.count({ where: setupWhere }),
      this.prisma.vehicleTireSetup.count({
        where: { ...setupWhere, measurements: { some: {} } },
      }),
      this.prisma.tireWearV3PriorShadowV1.groupBy({
        by: ['tireSetupId'],
      }),
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['tireSetupId'],
      }),
      this.prisma.tire.findMany({
        where: { active: true, tireSetId: { not: null } },
        select: { id: true, tireSetId: true, organizationId: true, currentPosition: true },
      }),
    ]);

    let confirmedPhysicalWheelSlots = 0;
    let unconfirmedPhysicalWheelSlots = 0;
    let ambiguousPhysicalWheelSlots = 0;

    const bySetup = new Map<string, Map<WheelPos, string[]>>();
    for (const tire of activeTires) {
      if (!tire.tireSetId) continue;
      const wheel = dbPosToWheel(tire.currentPosition);
      const map = bySetup.get(tire.tireSetId) ?? new Map();
      const list = map.get(wheel) ?? [];
      list.push(tire.id);
      map.set(wheel, list);
      bySetup.set(tire.tireSetId, map);
    }

    for (const wheelMap of bySetup.values()) {
      for (const wheel of WHEELS) {
        const ids = wheelMap.get(wheel) ?? [];
        if (ids.length === 1) confirmedPhysicalWheelSlots += 1;
        else if (ids.length === 0) unconfirmedPhysicalWheelSlots += 1;
        else ambiguousPhysicalWheelSlots += 1;
      }
    }

    return {
      organizationCountWithSetups: orgGroups.length,
      vehicleCountWithSetups: vehicleGroups.length,
      registeredSetupCount,
      setupsWithTreadMeasurements,
      setupsWithPriorShadowRows: setupsWithPriorShadowRows.length,
      setupsWithCalibrationSnapshots: setupsWithCalibrationSnapshots.length,
      confirmedPhysicalWheelSlots,
      unconfirmedPhysicalWheelSlots,
      ambiguousPhysicalWheelSlots,
      writer: { writeEnabled: this.writer.isWriteEnabled() },
    };
  }

  async listOrganizations(args: {
    limit?: number;
    offset?: number;
  }): Promise<TireInventoryOrgRollupPageDto> {
    const limit = this.clampPageLimit(args.limit);
    const offset = Math.max(0, args.offset ?? 0);

    const allOrgs = await this.prisma.vehicleTireSetup.groupBy({
      by: ['organizationId'],
      where: { organizationId: { not: null } },
      _count: { _all: true },
      orderBy: { organizationId: 'asc' },
    });

    const pageOrgs = allOrgs.slice(offset, offset + limit);
    const orgIds = pageOrgs
      .map((o) => o.organizationId)
      .filter((id): id is string => id != null);

    const items = await Promise.all(
      orgIds.map(async (organizationId) => {
        const [setups, vehicles, withMeas, priorGroups, snapGroups] = await Promise.all([
          this.prisma.vehicleTireSetup.count({ where: { organizationId } }),
          this.prisma.vehicleTireSetup.groupBy({
            by: ['vehicleId'],
            where: { organizationId },
          }),
          this.prisma.vehicleTireSetup.count({
            where: { organizationId, measurements: { some: {} } },
          }),
          this.prisma.tireWearV3PriorShadowV1.groupBy({
            by: ['tireSetupId'],
            where: { organizationId },
          }),
          this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
            by: ['tireSetupId'],
            where: { organizationId },
          }),
        ]);
        return {
          organizationId,
          registeredSetupCount: setups,
          vehicleCount: vehicles.length,
          setupsWithMeasurements: withMeas,
          setupsWithPriorShadow: priorGroups.length,
          setupsWithSnapshots: snapGroups.length,
        };
      }),
    );

    return { items, total: allOrgs.length, limit, offset };
  }

  async listVehicles(args: {
    organizationId: string;
    limit?: number;
    offset?: number;
  }): Promise<TireInventoryVehicleRollupPageDto> {
    const limit = this.clampPageLimit(args.limit);
    const offset = Math.max(0, args.offset ?? 0);

    const allVehicles = await this.prisma.vehicleTireSetup.groupBy({
      by: ['vehicleId'],
      where: { organizationId: args.organizationId },
      _count: { _all: true },
      orderBy: { vehicleId: 'asc' },
    });

    const page = allVehicles.slice(offset, offset + limit);

    const items = await Promise.all(
      page.map(async (row) => {
        const where = {
          organizationId: args.organizationId,
          vehicleId: row.vehicleId,
        };
        const [withMeas, priorGroups, snapCount] = await Promise.all([
          this.prisma.vehicleTireSetup.count({
            where: { ...where, measurements: { some: {} } },
          }),
          this.prisma.tireWearV3PriorShadowV1.groupBy({
            by: ['tireSetupId'],
            where,
          }),
          this.prisma.tireWearV3CalibrationSnapshotV1.count({ where }),
        ]);
        return {
          vehicleId: row.vehicleId,
          registeredSetupCount: row._count._all,
          setupsWithMeasurements: withMeas,
          setupsWithPriorShadow: priorGroups.length,
          snapshotCount: snapCount,
        };
      }),
    );

    return {
      organizationId: args.organizationId,
      items,
      total: allVehicles.length,
      limit,
      offset,
    };
  }

  async listSetupsForVehicle(args: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
    offset?: number;
  }): Promise<TireInventorySetupListDto> {
    await this.assertVehicleInOrg(args.organizationId, args.vehicleId);

    const limit = this.clampPageLimit(args.limit);
    const offset = Math.max(0, args.offset ?? 0);
    const where = {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
    };

    const [total, rows] = await Promise.all([
      this.prisma.vehicleTireSetup.count({ where }),
      this.prisma.vehicleTireSetup.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          installedAt: true,
          removedAt: true,
          _count: {
            select: {
              measurements: true,
              wearV3CalibrationSnapshots: true,
              wearV3PriorShadowRows: true,
            },
          },
          measurements: {
            orderBy: { measuredAt: 'desc' },
            take: 1,
            select: { measuredAt: true },
          },
        },
      }),
    ]);

    return {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      total,
      limit,
      offset,
      items: rows.map((r) => ({
        tireSetupId: r.id,
        name: r.name,
        status: r.status,
        installedAt: r.installedAt?.toISOString() ?? null,
        removedAt: r.removedAt?.toISOString() ?? null,
        snapshotCount: r._count.wearV3CalibrationSnapshots,
        measurementCount: r._count.measurements,
        hasPriorShadow: r._count.wearV3PriorShadowRows > 0,
        latestMeasurementAt: r.measurements[0]?.measuredAt.toISOString() ?? null,
      })),
    };
  }

  async getSetupDetail(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }): Promise<TireInventorySetupDetailDto> {
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: {
        id: args.tireSetupId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
      },
      include: {
        mountPeriods: {
          orderBy: { installedAt: 'asc' },
          select: {
            id: true,
            installedAt: true,
            removedAt: true,
            installedOdometerKm: true,
            odometerAnchorStatus: true,
          },
        },
        _count: {
          select: {
            measurements: true,
            wearV3CalibrationSnapshots: true,
          },
        },
      },
    });
    if (!setup) {
      throw new NotFoundException('Tire setup not found for scoped organization and vehicle');
    }

    const [latestMeasurement, activeTires, priorRow, ds4Agg, ds4Latest] = await Promise.all([
      this.prisma.vehicleTireTreadMeasurement.findFirst({
        where: { tireSetupId: setup.id, vehicleId: setup.vehicleId },
        orderBy: { measuredAt: 'desc' },
        select: {
          id: true,
          measuredAt: true,
          evidenceSource: true,
          source: true,
          frontLeftMm: true,
          frontRightMm: true,
          rearLeftMm: true,
          rearRightMm: true,
        },
      }),
      this.prisma.tire.findMany({
        where: {
          tireSetId: setup.id,
          organizationId: setup.organizationId!,
          active: true,
        },
        select: {
          id: true,
          currentPosition: true,
          brand: true,
          tireModel: true,
          dotCode: true,
        },
      }),
      this.prisma.tireWearV3PriorShadowV1.findFirst({
        where: { tireSetupId: setup.id, organizationId: setup.organizationId! },
        orderBy: { computedAt: 'desc' },
        select: {
          modelVersion: true,
          computedAt: true,
          inputFingerprint: true,
          resultPayload: true,
        },
      }),
      this.prisma.tireDs4MotionShadowInputV1.count({
        where: { tireSetupId: setup.id, organizationId: setup.organizationId! },
      }),
      this.prisma.tireDs4MotionShadowInputV1.findFirst({
        where: { tireSetupId: setup.id, organizationId: setup.organizationId! },
        orderBy: { createdAt: 'desc' },
        select: {
          ds4ReadStatus: true,
          eventQualityCoverage: true,
          createdAt: true,
        },
      }),
    ]);

    const tiresByWheel = new Map<WheelPos, typeof activeTires>();
    for (const wheel of WHEELS) {
      tiresByWheel.set(wheel, []);
    }
    for (const tire of activeTires) {
      const wheel = dbPosToWheel(tire.currentPosition);
      tiresByWheel.get(wheel)?.push(tire);
    }

    const wheels: TireInventoryWheelAssignmentDto[] = WHEELS.map((wheel) => {
      const atWheel = tiresByWheel.get(wheel) ?? [];
      const ambiguous = atWheel.length > 1;
      const chosen = atWheel.length === 1 ? atWheel[0]! : null;
      return {
        wheelPosition: wheel,
        physicalTireId: chosen?.id ?? null,
        physicalIdentityStatus: wheelPhysicalStatus(chosen?.id ?? null, ambiguous),
        tireBrand: chosen?.brand ?? null,
        tireModel: chosen?.tireModel ?? null,
        dotCode: chosen?.dotCode ?? null,
        latestMeasurement: treadFromSetupMeasurement(latestMeasurement, wheel),
      };
    });

    const activePeriod = resolveActiveMountPeriod(
      setup.mountPeriods,
      new Date(),
      {
        installedAt: setup.installedAt,
        removedAt: setup.removedAt,
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus,
      },
    );

    const priorShadow = this.readPriorShadow(priorRow);
    const ds4 = this.readDs4(ds4Agg, ds4Latest);
    const calibrationEligibility = await this.readEligibility(args);

    return {
      organizationId: setup.organizationId!,
      vehicleId: setup.vehicleId,
      tireSetupId: setup.id,
      name: setup.name,
      status: setup.status,
      tireSeason: setup.tireSeason,
      frontDimension: setup.frontDimension,
      rearDimension: setup.rearDimension,
      brandModelFront: setup.brandModelFront,
      brandModelRear: setup.brandModelRear,
      installedAt: setup.installedAt?.toISOString() ?? null,
      removedAt: setup.removedAt?.toISOString() ?? null,
      activeMountPeriodId: activePeriod?.id ?? null,
      activeMountInstalledAt: activePeriod?.installedAt.toISOString() ?? null,
      activeMountRemovedAt: activePeriod?.removedAt?.toISOString() ?? null,
      odometerAnchorStatus: setup.odometerAnchorStatus,
      snapshotCount: setup._count.wearV3CalibrationSnapshots,
      measurementCount: setup._count.measurements,
      wheels,
      priorShadow,
      ds4,
      calibrationEligibility,
    };
  }

  private readPriorShadow(
    priorRow: {
      modelVersion: string;
      computedAt: Date;
      inputFingerprint: string;
      resultPayload: unknown;
    } | null,
  ): TireInventoryPriorShadowReadDto {
    if (!priorRow) {
      return {
        availability: 'NOT_PERSISTED',
        modelVersion: null,
        computedAt: null,
        inputFingerprintPrefix: null,
        wheelSummaries: [],
      };
    }
    const payload = priorRow.resultPayload as TireWearV3PriorSetupResult | null;
    const wheelSummaries =
      payload?.wheels?.map((w) => ({
        wheelPosition: w.position,
        treadEvidenceClass: w.treadEvidenceClass ?? null,
        displayTreadMmLo: w.displayTreadMm?.lo ?? null,
        displayTreadMmHi: w.displayTreadMm?.hi ?? null,
        pointEstimateTreadMm: w.pointEstimateTreadMm ?? null,
        evidenceLevel: w.evidenceLevel ?? null,
      })) ?? [];

    return {
      availability: 'AVAILABLE',
      modelVersion: priorRow.modelVersion,
      computedAt: priorRow.computedAt.toISOString(),
      inputFingerprintPrefix: priorRow.inputFingerprint.slice(0, 12),
      wheelSummaries,
    };
  }

  private readDs4(
    count: number,
    latest: {
      ds4ReadStatus: string;
      eventQualityCoverage: string;
      createdAt: Date;
    } | null,
  ): TireInventoryDs4ReadDto {
    if (count === 0 || !latest) {
      return {
        persistedRowCount: 0,
        latestDs4ReadStatus: null,
        latestEventQualityCoverage: null,
        latestCreatedAt: null,
        availability: 'NOT_PERSISTED',
      };
    }
    return {
      persistedRowCount: count,
      latestDs4ReadStatus: latest.ds4ReadStatus,
      latestEventQualityCoverage: latest.eventQualityCoverage,
      latestCreatedAt: latest.createdAt.toISOString(),
      availability: 'AVAILABLE',
    };
  }

  private async readEligibility(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }): Promise<TireInventoryCalibrationEligibilityReadDto> {
    const ctx = await this.eligibility.resolveForSetup({
      organizationId: args.organizationId,
      tireSetupId: args.tireSetupId,
    });
    if (!ctx) {
      return {
        evaluable: false,
        reason: 'ACTIVE_MOUNT_OR_SCOPE_UNAVAILABLE',
        calibrationEligibilityDigestPrefix: null,
        rotationDuringMountPeriod: null,
        physicalIdentityAmbiguous: null,
        latestSourceMeasurementAt: null,
      };
    }
    if (ctx.vehicleId !== args.vehicleId) {
      return {
        evaluable: false,
        reason: 'VEHICLE_SCOPE_MISMATCH',
        calibrationEligibilityDigestPrefix: null,
        rotationDuringMountPeriod: null,
        physicalIdentityAmbiguous: null,
        latestSourceMeasurementAt: null,
      };
    }
    return {
      evaluable: true,
      reason: null,
      calibrationEligibilityDigestPrefix: ctx.calibrationEligibilityDigest.slice(0, 12),
      rotationDuringMountPeriod: ctx.rotationDuringMountPeriod,
      physicalIdentityAmbiguous: ctx.physicalIdentityAmbiguous,
      latestSourceMeasurementAt: ctx.latestSourceMeasurementAt?.toISOString() ?? null,
    };
  }

  private async assertVehicleInOrg(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }
}
