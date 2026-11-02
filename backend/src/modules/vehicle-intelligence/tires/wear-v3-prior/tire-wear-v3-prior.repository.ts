import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  extractM3JPerKgPerKmFromShadowPayload,
  extractTemporalDetailFromShadowPayload,
  extractTemporalSecondsFromShadowPayload,
  resolveDs4TemporalTripWeight,
} from './tire-wear-v3-ds4-payload.util';
import type { TireWearV3Ds4LedgerShadowRow } from './tire-wear-v3-dynamic.math';
import type { TireWearV3PriorSetupResult } from './tire-wear-v3-prior.types';

@Injectable()
export class TireWearV3PriorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestShadowRow(
    tireSetupId: string,
    modelVersion: string,
    inputFingerprint: string,
  ) {
    return this.prisma.tireWearV3PriorShadowV1.findFirst({
      where: {
        tireSetupId,
        modelVersion,
        inputFingerprint,
      },
      orderBy: { computedAt: 'desc' },
      select: { id: true },
    });
  }

  async insertShadowRow(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    modelVersion: string;
    modelConfigHash: string;
    inputFingerprint: string;
    resultPayload: TireWearV3PriorSetupResult;
  }) {
    return this.prisma.tireWearV3PriorShadowV1.create({
      data: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
        modelVersion: args.modelVersion,
        modelConfigHash: args.modelConfigHash,
        inputFingerprint: args.inputFingerprint,
        resultPayload: args.resultPayload as object,
        computedAt: new Date(args.resultPayload.computedAt),
      },
    });
  }

  /**
   * Latest succeeded DS4 shadow row per ledger id (read-only; does not enqueue or mutate DS4).
   */
  async findLatestDs4ShadowEvidenceByLedgerIds(
    ledgerIds: string[],
  ): Promise<TireWearV3Ds4LedgerShadowRow[]> {
    if (ledgerIds.length === 0) return [];

    const rows = await this.prisma.tireDs4MotionShadowInputV1.findMany({
      where: {
        tireTripUsageLedgerId: { in: ledgerIds },
        ds4ReadStatus: 'SUCCEEDED',
      },
      select: {
        tireTripUsageLedgerId: true,
        temporalCoverage: true,
        ds4ReadStatus: true,
        speedAuthority: true,
        inputPayload: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const byLedger = new Map<string, TireWearV3Ds4LedgerShadowRow>();
    for (const row of rows) {
      if (byLedger.has(row.tireTripUsageLedgerId)) continue;
      const temporal = extractTemporalSecondsFromShadowPayload(row.inputPayload);
      const temporalDetail = extractTemporalDetailFromShadowPayload(row.inputPayload);
      const m3 = extractM3JPerKgPerKmFromShadowPayload(row.inputPayload);
      const weightResolved = resolveDs4TemporalTripWeight({
        ds4ReadStatus: row.ds4ReadStatus,
        temporalCoverage: row.temporalCoverage,
        m3JPerKgPerKm: m3,
        detail: temporalDetail,
        speedAuthority: row.speedAuthority,
      });
      byLedger.set(row.tireTripUsageLedgerId, {
        ledgerId: row.tireTripUsageLedgerId,
        distanceKm: 0,
        ds4ReadStatus: row.ds4ReadStatus,
        temporalCoverage: row.temporalCoverage,
        m3JPerKgPerKm: m3,
        validDrivingSeconds: temporal.validDrivingSeconds,
        tripDurationSeconds: temporal.tripDurationSeconds,
        temporalDetail,
        speedAuthority: row.speedAuthority,
        temporalTripWeight: weightResolved.weight,
        temporalWeightFlags: weightResolved.flags,
      });
    }
    return [...byLedger.values()];
  }

  async insertShadowRowIdempotent(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    modelVersion: string;
    modelConfigHash: string;
    inputFingerprint: string;
    resultPayload: TireWearV3PriorSetupResult;
  }) {
    const existing = await this.findLatestShadowRow(
      args.tireSetupId,
      args.modelVersion,
      args.inputFingerprint,
    );
    if (existing) return existing;

    try {
      return await this.insertShadowRow(args);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return (
          (await this.findLatestShadowRow(
            args.tireSetupId,
            args.modelVersion,
            args.inputFingerprint,
          )) ?? null
        );
      }
      throw err;
    }
  }
}
