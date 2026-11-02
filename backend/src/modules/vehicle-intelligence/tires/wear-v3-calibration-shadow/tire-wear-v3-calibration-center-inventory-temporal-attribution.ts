import type { TirePosition } from '@prisma/client';
import type { WheelPos } from '../tire-evidence-provenance';
import { dbPosToWheel, wheelPosToDb } from '../tire-identity.service';
import {
  hasRotationDuringMountPeriod,
  isInstantInMountPeriod,
  type MountPeriodWindow,
} from '../wear-v3-prior/tire-wear-v3-prior.lifecycle';

export type TireInventoryMeasurementToTireAttributionStatus =
  | 'CONFIRMED'
  | 'NOT_ATTRIBUTABLE'
  | 'AMBIGUOUS';

export type InventoryTireMountRecord = {
  id: string;
  mountedAt: Date;
  dismountedAt: Date | null;
  installedPosition: TirePosition;
};

export type InventoryPositionHistoryRow = {
  tireId: string | null;
  toPosition: TirePosition;
  changedAt: Date;
};

export type ResolveMeasurementAttributionInput = {
  wheel: WheelPos;
  measuredAt: Date;
  mountPeriodAtMeasurement: MountPeriodWindow | null;
  rotationEvents: Array<{ changedAt: Date }>;
  positionHistory: InventoryPositionHistoryRow[];
  tires: InventoryTireMountRecord[];
  currentPhysicalTireId: string | null;
};

export type ResolveMeasurementAttributionResult = {
  status: TireInventoryMeasurementToTireAttributionStatus;
  attributedPhysicalTireId: string | null;
  linksMeasurementToCurrentMountedTire: boolean;
};

export function pickLatestSetupMeasurementForWheel<
  T extends {
    measuredAt: Date;
    frontLeftMm: number | null;
    frontRightMm: number | null;
    rearLeftMm: number | null;
    rearRightMm: number | null;
  },
>(measurements: T[], wheel: WheelPos): T | null {
  const sorted = [...measurements].sort(
    (a, b) => b.measuredAt.getTime() - a.measuredAt.getTime(),
  );
  for (const m of sorted) {
    const tread =
      wheel === 'FL'
        ? m.frontLeftMm
        : wheel === 'FR'
          ? m.frontRightMm
          : wheel === 'RL'
            ? m.rearLeftMm
            : m.rearRightMm;
    if (tread != null) return m;
  }
  return null;
}

function tireOnVehicleAtInstant(
  tire: InventoryTireMountRecord,
  instant: Date,
): boolean {
  if (tire.mountedAt.getTime() > instant.getTime()) return false;
  if (tire.dismountedAt != null && tire.dismountedAt.getTime() <= instant.getTime()) {
    return false;
  }
  return true;
}

/**
 * Replays tire position history up to `instant` and returns tire ids at `wheel`.
 * Does not use current wheel assignment as a historical fallback.
 */
export function resolvePhysicalTireIdsAtWheelAtInstant(args: {
  wheel: WheelPos;
  instant: Date;
  positionHistory: InventoryPositionHistoryRow[];
  tires: InventoryTireMountRecord[];
}): string[] {
  const targetDb = wheelPosToDb(args.wheel);
  const history = [...args.positionHistory]
    .filter((e) => e.changedAt.getTime() <= args.instant.getTime())
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());

  const positionByTire = new Map<string, TirePosition>();

  for (const tire of args.tires) {
    if (!tireOnVehicleAtInstant(tire, args.instant)) continue;
    const hasHistoryForTire = history.some(
      (e) => e.tireId != null && e.tireId === tire.id,
    );
    if (!hasHistoryForTire) {
      positionByTire.set(tire.id, tire.installedPosition);
    }
  }

  for (const event of history) {
    if (!event.tireId) continue;
    positionByTire.set(event.tireId, event.toPosition);
  }

  for (const tire of args.tires) {
    if (!tireOnVehicleAtInstant(tire, args.instant)) {
      positionByTire.delete(tire.id);
    }
  }

  const matches: string[] = [];
  for (const [tireId, pos] of positionByTire.entries()) {
    if (pos === targetDb) matches.push(tireId);
  }
  return matches;
}

export function resolveMeasurementToTireAttribution(
  args: ResolveMeasurementAttributionInput,
): ResolveMeasurementAttributionResult {
  const fail = (
    status: TireInventoryMeasurementToTireAttributionStatus,
  ): ResolveMeasurementAttributionResult => ({
    status,
    attributedPhysicalTireId: null,
    linksMeasurementToCurrentMountedTire: false,
  });

  if (args.mountPeriodAtMeasurement == null) {
    return fail('NOT_ATTRIBUTABLE');
  }
  if (
    !isInstantInMountPeriod(args.measuredAt, args.mountPeriodAtMeasurement)
  ) {
    return fail('NOT_ATTRIBUTABLE');
  }

  const rotationDuringMount = hasRotationDuringMountPeriod(
    args.rotationEvents,
    args.mountPeriodAtMeasurement,
  );

  if (rotationDuringMount && args.positionHistory.length === 0) {
    return fail('NOT_ATTRIBUTABLE');
  }

  const matches = resolvePhysicalTireIdsAtWheelAtInstant({
    wheel: args.wheel,
    instant: args.measuredAt,
    positionHistory: args.positionHistory,
    tires: args.tires,
  });

  if (matches.length === 0) {
    return fail('NOT_ATTRIBUTABLE');
  }
  if (matches.length > 1) {
    return fail('AMBIGUOUS');
  }

  const attributedPhysicalTireId = matches[0]!;
  const linksMeasurementToCurrentMountedTire =
    args.currentPhysicalTireId != null &&
    attributedPhysicalTireId === args.currentPhysicalTireId;

  return {
    status: 'CONFIRMED',
    attributedPhysicalTireId,
    linksMeasurementToCurrentMountedTire,
  };
}
