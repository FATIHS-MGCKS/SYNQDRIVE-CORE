import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TireWearV3CalibrationSnapshotPayload } from './tire-wear-v3-calibration-snapshot.types';

export type SnapshotListCursor = {
  predictionCreatedAt: Date;
  id: string;
};

export function encodeSnapshotListCursor(cursor: SnapshotListCursor): string {
  return Buffer.from(
    JSON.stringify({
      at: cursor.predictionCreatedAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');
}

export function decodeSnapshotListCursor(raw: string): SnapshotListCursor {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { at?: string; id?: string };
    if (!parsed.id || typeof parsed.id !== 'string') {
      throw new Error('missing id');
    }
    const predictionCreatedAt = new Date(parsed.at ?? '');
    if (Number.isNaN(predictionCreatedAt.getTime())) {
      throw new Error('invalid at');
    }
    return { predictionCreatedAt, id: parsed.id };
  } catch {
    throw new NotFoundException('Invalid snapshot list cursor');
  }
}

export function buildSnapshotListKeysetWhere(args: {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  wheelPosition?: string;
  mountPeriodId?: string;
  cursor: SnapshotListCursor | null;
}): Prisma.TireWearV3CalibrationSnapshotV1WhereInput {
  const scope: Prisma.TireWearV3CalibrationSnapshotV1WhereInput = {
    organizationId: args.organizationId,
    vehicleId: args.vehicleId,
    tireSetupId: args.tireSetupId,
    ...(args.wheelPosition ? { wheelPosition: args.wheelPosition } : {}),
    ...(args.mountPeriodId ? { mountPeriodId: args.mountPeriodId } : {}),
  };

  if (!args.cursor) {
    return scope;
  }

  const { predictionCreatedAt, id } = args.cursor;
  return {
    AND: [
      scope,
      {
        OR: [
          { predictionCreatedAt: { lt: predictionCreatedAt } },
          {
            AND: [{ predictionCreatedAt }, { id: { lt: id } }],
          },
        ],
      },
    ],
  };
}

export function sanitizeCalibrationSnapshotPayloadForMasterRead(
  payload: TireWearV3CalibrationSnapshotPayload,
): TireWearV3CalibrationSnapshotPayload {
  const {
    inputFingerprint: _inputFingerprint,
    calibrationEligibilityDigest: _calibrationEligibilityDigest,
    ...predictionRest
  } = payload.prediction;

  return {
    ...payload,
    prediction: predictionRest as TireWearV3CalibrationSnapshotPayload['prediction'],
  };
}
