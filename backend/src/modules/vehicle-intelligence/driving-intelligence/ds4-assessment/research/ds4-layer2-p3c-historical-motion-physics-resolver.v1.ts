import type { PrismaClient } from '@prisma/client';
import type {
  Ds4Layer2MotionPhysicsContextReferenceSnapshotV1,
  Ds4Layer2MotionPhysicsContextVehicleSnapshotV1,
} from './ds4-layer2-p3-motion-physics-context.v1.contract';
import type {
  Ds4Layer2P3cReferenceResolutionSourceV1,
  Ds4Layer2P3cVehicleReferenceResolutionV1,
} from './ds4-layer2-p3c-physics-diagnostics.v1.contract';

export type Ds4Layer2P3cHistoricalReferenceRowV1 = Ds4Layer2MotionPhysicsContextReferenceSnapshotV1 & {
  createdAt: Date;
};

function isEffectiveDuringTrip(row: Ds4Layer2P3cHistoricalReferenceRowV1, tripStart: Date, tripEnd: Date): boolean {
  if (row.effectiveFrom.getTime() > tripEnd.getTime()) return false;
  if (row.effectiveTo != null && row.effectiveTo.getTime() < tripStart.getTime()) return false;
  return true;
}

/**
 * Read-only point-in-time selection across all reference rows (including superseded).
 * Does not mutate P3B active-reference resolver semantics.
 */
export function selectMotionPhysicsReferenceEffectiveAtTripV1(input: {
  rows: readonly Ds4Layer2P3cHistoricalReferenceRowV1[];
  tripStartUtc: Date;
  tripEndUtc: Date;
}): {
  row: Ds4Layer2P3cHistoricalReferenceRowV1 | null;
  selectedFromSupersededRow: boolean;
} {
  const candidates = input.rows
    .filter((row) => isEffectiveDuringTrip(row, input.tripStartUtc, input.tripEndUtc))
    .filter((row) => row.createdAt.getTime() <= input.tripEndUtc.getTime())
    .sort((a, b) => {
      const ef = b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
      if (ef !== 0) return ef;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const row = candidates[0] ?? null;
  if (row == null) {
    return { row: null, selectedFromSupersededRow: false };
  }

  const selectedFromSupersededRow = !row.isActive || row.supersededById != null;
  return { row, selectedFromSupersededRow };
}

export function mapPrismaRowToHistoricalSnapshotV1(
  row: {
    id: string;
    organizationId: string;
    vehicleId: string;
    identityFingerprintJson: unknown;
    curbMassKg: number | null;
    systemMotorPowerKw: number | null;
    systemPowerDefinition: string | null;
    accel0To100S: number | null;
    evidenceTier: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1['evidenceTier'];
    source: Ds4Layer2MotionPhysicsContextReferenceSnapshotV1['source'];
    verifiedAt: Date | null;
    verifiedByUserId: string | null;
    documentExtractionId: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isActive: boolean;
    supersededById: string | null;
    variantAssumption: string | null;
    createdAt: Date;
  },
): Ds4Layer2P3cHistoricalReferenceRowV1 {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    identityFingerprintJson: row.identityFingerprintJson,
    curbMassKg: row.curbMassKg,
    systemMotorPowerKw: row.systemMotorPowerKw,
    systemPowerDefinition: row.systemPowerDefinition,
    accel0To100S: row.accel0To100S,
    evidenceTier: row.evidenceTier,
    source: row.source,
    verifiedAt: row.verifiedAt,
    verifiedByUserId: row.verifiedByUserId,
    documentExtractionId: row.documentExtractionId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    isActive: row.isActive,
    supersededById: row.supersededById,
    variantAssumption: row.variantAssumption,
    createdAt: row.createdAt,
  };
}

/** Read-only Prisma historical resolver for offline research tooling. */
export function createDs4Layer2P3cHistoricalReferenceResolverFromPrisma(
  prisma: PrismaClient,
): (input: {
  organizationId: string;
  vehicleId: string;
  tripStartUtc: Date;
  tripEndUtc: Date;
}) => Promise<Ds4Layer2P3cVehicleReferenceResolutionV1 | null> {
  return async ({ organizationId, vehicleId, tripStartUtc, tripEndUtc }) => {
    const vehicleRow = await prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true, organizationId: true, vin: true, make: true, model: true, year: true },
    });
    if (vehicleRow == null) return null;

    const vehicle: Ds4Layer2MotionPhysicsContextVehicleSnapshotV1 = {
      id: vehicleRow.id,
      organizationId: vehicleRow.organizationId,
      vin: vehicleRow.vin,
      make: vehicleRow.make,
      model: vehicleRow.model,
      year: vehicleRow.year,
    };

    const dbRows = await prisma.vehicleMotionPhysicsReference.findMany({
      where: { organizationId, vehicleId },
      orderBy: { effectiveFrom: 'desc' },
    });

    const rows = dbRows.map(mapPrismaRowToHistoricalSnapshotV1);
    const { row, selectedFromSupersededRow } = selectMotionPhysicsReferenceEffectiveAtTripV1({
      rows,
      tripStartUtc,
      tripEndUtc,
    });

    if (row == null) {
      return {
        vehicle,
        reference: null,
        resolutionSource: 'PERSISTED_POINT_IN_TIME',
        referenceCreatedAtUtc: null,
        selectedFromSupersededRow: false,
      };
    }

    const resolutionSource: Ds4Layer2P3cReferenceResolutionSourceV1 = 'PERSISTED_POINT_IN_TIME';
    return {
      vehicle,
      reference: row,
      resolutionSource,
      referenceCreatedAtUtc: row.createdAt.toISOString(),
      selectedFromSupersededRow,
    };
  };
}
