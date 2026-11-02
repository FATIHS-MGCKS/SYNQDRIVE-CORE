import { Injectable } from '@nestjs/common';
import { TireOdometerAnchorStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { WheelPos } from '../tire-evidence-provenance';
import { dbPosToWheel } from '../tire-identity.service';
import {
  computeTireWearV3CalibrationEligibilityDigest,
  type TireWearV3PriorFingerprintInput,
} from '../wear-v3-prior/tire-wear-v3-prior.fingerprint';
import {
  filterLedgerRowsForMountPeriod,
  filterMeasurementsForMountPeriod,
  hasRotationDuringMountPeriod,
  resolveActiveMountPeriod,
  stableLedgerContentDigest,
  sumLedgerDistanceKm,
} from '../wear-v3-prior/tire-wear-v3-prior.lifecycle';

export type TireWearV3CalibrationEligibilityContext = {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  activePeriod: NonNullable<ReturnType<typeof resolveActiveMountPeriod>>;
  fingerprintInput: TireWearV3PriorFingerprintInput;
  calibrationEligibilityDigest: string;
  rotationDuringMountPeriod: boolean;
  physicalTireIdByWheel: Record<WheelPos, string | null>;
  physicalIdentityAmbiguous: boolean;
  measurementIdsUsed: string[];
  latestSourceMeasurementAt: Date | null;
  sourceDataCutoffAt: Date;
};

@Injectable()
export class TireWearV3CalibrationEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForSetup(args: {
    tireSetupId: string;
    organizationId: string;
    asOf?: Date;
  }): Promise<TireWearV3CalibrationEligibilityContext | null> {
    const asOf = args.asOf ?? new Date();

    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: {
        id: args.tireSetupId,
        organizationId: args.organizationId,
      },
      include: {
        vehicle: { select: { organizationId: true } },
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
      },
    });
    if (!setup?.organizationId) return null;
    if (setup.vehicle.organizationId !== setup.organizationId) return null;

    const activePeriod = resolveActiveMountPeriod(
      setup.mountPeriods,
      asOf,
      {
        installedAt: setup.installedAt,
        removedAt: setup.removedAt,
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus,
      },
    );
    if (!activePeriod) return null;

    const ledgerRowsAll = await this.prisma.tireTripUsageLedger.findMany({
      where: { tireSetupId: setup.id, invalidatedAt: null },
      select: {
        id: true,
        tripId: true,
        distanceKm: true,
        revisionNumber: true,
        sourceFingerprint: true,
        tripStartedAt: true,
      },
      orderBy: { tripStartedAt: 'asc' },
    });
    const ledgerRows = filterLedgerRowsForMountPeriod(ledgerRowsAll, activePeriod);
    const ledgerDistanceKm = sumLedgerDistanceKm(ledgerRows);
    const ledgerDigest = stableLedgerContentDigest(ledgerRows);

    const measurementsRawAll = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: { tireSetupId: setup.id },
      orderBy: { measuredAt: 'asc' },
      select: {
        id: true,
        measuredAt: true,
        odometerAtMeasurement: true,
        frontLeftMm: true,
        frontRightMm: true,
        rearLeftMm: true,
        rearRightMm: true,
      },
    });
    const measurementsRaw = filterMeasurementsForMountPeriod(
      measurementsRawAll,
      activePeriod,
    ).filter((m) => m.measuredAt.getTime() <= asOf.getTime());

    const rotationEvents = await this.prisma.tirePositionHistory.findMany({
      where: { tireSetId: setup.id },
      select: { changedAt: true },
    });
    const rotationDuringMountPeriod = hasRotationDuringMountPeriod(
      rotationEvents,
      activePeriod,
    );

    const fingerprintInput: TireWearV3PriorFingerprintInput = {
      tireSetupId: setup.id,
      vehicleId: setup.vehicleId,
      organizationId: setup.organizationId,
      setupRevision: {
        installedOdometerKm: setup.installedOdometerKm,
        odometerAnchorStatus: setup.odometerAnchorStatus,
        initialTreadFrontMm: setup.initialTreadFrontMm,
        initialTreadRearMm: setup.initialTreadRearMm,
        initialTreadDepthMm: setup.initialTreadDepthMm,
        expectedLifeKm: setup.expectedLifeKm,
        tireSeason: setup.tireSeason,
      },
      mountPeriod: {
        id: activePeriod.id,
        installedAtIso: activePeriod.installedAt.toISOString(),
        removedAtIso: activePeriod.removedAt?.toISOString() ?? null,
        installedOdometerKm: activePeriod.installedOdometerKm,
      },
      ledger: {
        activeRowCount: ledgerRows.length,
        totalDistanceKm: ledgerDistanceKm,
        contentDigest: ledgerDigest,
      },
      measurements: measurementsRaw.map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt.toISOString(),
        odometerAtMeasurement: m.odometerAtMeasurement,
        frontLeftMm: m.frontLeftMm,
        frontRightMm: m.frontRightMm,
        rearLeftMm: m.rearLeftMm,
        rearRightMm: m.rearRightMm,
      })),
      currentOdometerKm: null,
      dataCutoffIso: asOf.toISOString(),
    };

    const calibrationEligibilityDigest =
      computeTireWearV3CalibrationEligibilityDigest(fingerprintInput);

    const { physicalTireIdByWheel, physicalIdentityAmbiguous } =
      await this.resolvePhysicalTireIds(setup.id, setup.organizationId);

    let latestSourceMeasurementAt: Date | null = null;
    for (const m of measurementsRaw) {
      if (
        latestSourceMeasurementAt == null ||
        m.measuredAt.getTime() > latestSourceMeasurementAt.getTime()
      ) {
        latestSourceMeasurementAt = m.measuredAt;
      }
    }

    return {
      organizationId: setup.organizationId,
      vehicleId: setup.vehicleId,
      tireSetupId: setup.id,
      activePeriod,
      fingerprintInput,
      calibrationEligibilityDigest,
      rotationDuringMountPeriod,
      physicalTireIdByWheel,
      physicalIdentityAmbiguous,
      measurementIdsUsed: measurementsRaw.map((m) => m.id),
      latestSourceMeasurementAt,
      sourceDataCutoffAt: asOf,
    };
  }

  private async resolvePhysicalTireIds(
    tireSetId: string,
    organizationId: string,
  ): Promise<{
    physicalTireIdByWheel: Record<WheelPos, string | null>;
    physicalIdentityAmbiguous: boolean;
  }> {
    const wheels: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];
    const empty: Record<WheelPos, string | null> = {
      FL: null,
      FR: null,
      RL: null,
      RR: null,
    };

    const tires = await this.prisma.tire.findMany({
      where: { tireSetId, organizationId, active: true },
      select: { id: true, currentPosition: true },
    });

    if (tires.length === 0) {
      return { physicalTireIdByWheel: empty, physicalIdentityAmbiguous: true };
    }

    const byWheel = new Map<WheelPos, string[]>();
    for (const tire of tires) {
      const wheel = dbPosToWheel(tire.currentPosition);
      const list = byWheel.get(wheel) ?? [];
      list.push(tire.id);
      byWheel.set(wheel, list);
    }

    let ambiguous = false;
    for (const wheel of wheels) {
      const ids = byWheel.get(wheel) ?? [];
      if (ids.length === 1) {
        empty[wheel] = ids[0]!;
      } else if (ids.length > 1) {
        ambiguous = true;
      }
    }

    if (tires.some((t) => !t.currentPosition)) {
      ambiguous = true;
    }

    return { physicalTireIdByWheel: empty, physicalIdentityAmbiguous: ambiguous };
  }
}
