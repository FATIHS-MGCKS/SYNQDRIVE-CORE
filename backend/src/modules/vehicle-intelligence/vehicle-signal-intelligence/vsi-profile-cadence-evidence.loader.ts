import { Injectable, Optional } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { buildP25ApdProfileLvLoaderWhere } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-lv-loader';
import {
  clipTripWindowsToLinkBounds,
  resolveIceRpmApplicability,
} from './vsi-profile-cadence-stats.util';
import type {
  VsiHfCadenceReadStatus,
  VsiLvCadenceEvidenceInput,
  VsiLvCadenceEvidencePoint,
  VsiLvStandbyTransmissionEvidenceInput,
  VsiRpmCadenceEvidenceInput,
  VsiRpmCadenceTripWindow,
} from './vsi-profile-cadence.types';
import { loadLvStandbyTransmissionEvidenceFromDb } from './vsi-lv-standby-transmission-evidence.loader';
import {
  loadLinkScopedRpmHfCadencePointsV1,
  type VsiSourceLinkIntervalV1,
} from './vsi-rpm-hf-link-scoped-cadence-evidence.util';

const RPM_HISTORY_DAYS = 14;
const MAX_FINALIZED_TRIPS = 20;
const MAX_RPM_POINTS = 12_000;
const MAX_LV_ROWS = 256;

const ENGINE_RPM_SIGNAL = 'powertrainCombustionEngineSpeed';

/** Public surface for cadence evidence loading (tests may supply a noop port). */
export interface VsiProfileCadenceEvidencePort {
  loadRpmEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<VsiRpmCadenceEvidenceInput | null>;
  loadLvEvidence(ctx: VsiProfileCadenceLoadContext): Promise<VsiLvCadenceEvidenceInput | null>;
  loadLvStandbyTransmissionEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<import('./vsi-profile-cadence.types').VsiLvStandbyTransmissionEvidenceInput | null>;
}

export type VsiProfileCadenceLoadContext = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  fuelType: string | null;
  linkActivatedAt: Date;
  linkDeactivatedAt: Date | null;
  projectionAsOf: Date;
  refreshRpmCadence: boolean;
  refreshLvCadence: boolean;
  /** When set, HF readiness is checked for this trip before RPM cadence refresh. */
  rpmTripIdForReadiness?: string | null;
};

@Injectable()
export class VsiProfileCadenceEvidenceLoader implements VsiProfileCadenceEvidencePort {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clickHouseHf?: ClickHouseHfService,
  ) {}

  async loadRpmEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<VsiRpmCadenceEvidenceInput | null> {
    if (!ctx.refreshRpmCadence) {
      return null;
    }

    const iceRpmApplicability = resolveIceRpmApplicability(ctx.fuelType);
    const linkActivatedMs = ctx.linkActivatedAt.getTime();
    const linkDeactivatedMs = ctx.linkDeactivatedAt?.getTime() ?? null;
    const windowStart = new Date(
      Math.max(
        linkActivatedMs,
        ctx.projectionAsOf.getTime() - RPM_HISTORY_DAYS * 24 * 3600 * 1000,
      ),
    );

    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: ctx.vehicleId,
        vehicle: { organizationId: ctx.organizationId },
        tripStatus: TripStatus.COMPLETED,
        endTime: { not: null, gte: windowStart, lte: ctx.projectionAsOf },
        startTime: { lte: ctx.projectionAsOf },
      },
      orderBy: { endTime: 'desc' },
      take: MAX_FINALIZED_TRIPS,
      select: { id: true, startTime: true, endTime: true },
    });

    const tripWindows: VsiRpmCadenceTripWindow[] = clipTripWindowsToLinkBounds(
      trips
        .filter((t) => t.endTime != null)
        .map((t) => ({
          tripId: t.id,
          startMs: t.startTime.getTime(),
          endMs: t.endTime!.getTime(),
        })),
      linkActivatedMs,
      linkDeactivatedMs,
    );

    let hfReadStatus: VsiHfCadenceReadStatus = 'SKIPPED';
    let points: VsiRpmCadenceEvidenceInput['points'] = [];
    let attributionLimitations: string[] = [];

    if (iceRpmApplicability === 'APPLICABLE' && tripWindows.length > 0) {
      if (!this.clickHouseHf) {
        hfReadStatus = 'UNAVAILABLE';
      } else {
        if (ctx.rpmTripIdForReadiness) {
          const ready = await this.clickHouseHf.hasTripHfPoints(
            ctx.vehicleId,
            ctx.rpmTripIdForReadiness,
          );
          if (!ready) {
            return {
              iceRpmApplicability,
              tripWindows,
              points: [],
              provenance: [],
              hfReadStatus: 'EMPTY',
              attributionLimitations: [],
            };
          }
        }

        const [linkRow, linkHistory] = await Promise.all([
          this.prisma.vehicleDataSourceLink.findFirst({
            where: { id: ctx.providerSourceLinkId, vehicleId: ctx.vehicleId },
            select: {
              id: true,
              provider: true,
              dimoVehicle: { select: { tokenId: true } },
            },
          }),
          this.prisma.vehicleDataSourceLink.findMany({
            where: { vehicleId: ctx.vehicleId },
            select: { id: true, activatedAt: true, deactivatedAt: true },
          }),
        ]);

        const linkIntervals: VsiSourceLinkIntervalV1[] = linkHistory.map((row) => ({
          id: row.id,
          activatedAtMs: row.activatedAt.getTime(),
          deactivatedAtMs: row.deactivatedAt?.getTime() ?? null,
        }));

        const provider = linkRow?.provider?.trim().toUpperCase() ?? '';
        const requireDimoToken = provider === 'DIMO';
        const expectedDimoTokenId = linkRow?.dimoVehicle?.tokenId ?? null;

        const loaded = await loadLinkScopedRpmHfCadencePointsV1({
          organizationId: ctx.organizationId,
          vehicleId: ctx.vehicleId,
          targetLinkId: ctx.providerSourceLinkId,
          linkIntervals,
          tripWindows,
          expectedDimoTokenId,
          requireDimoToken,
          maxPoints: MAX_RPM_POINTS,
          hf: {
            getTripRpmHfPoints: (input) =>
              this.clickHouseHf!.getTripRpmHfPoints({
                ...input,
                signalName: ENGINE_RPM_SIGNAL,
              }),
          },
        });

        hfReadStatus = loaded.hfReadStatus;
        points = loaded.points;
        attributionLimitations = loaded.attributionLimitations;
      }
    }

    return {
      iceRpmApplicability,
      tripWindows,
      points,
      provenance:
        hfReadStatus === 'SUCCESS' ? ['CLICKHOUSE_TELEMETRY_HF_POINTS'] : [],
      hfReadStatus,
      attributionLimitations,
    };
  }

  async loadLvEvidence(ctx: VsiProfileCadenceLoadContext): Promise<VsiLvCadenceEvidenceInput | null> {
    if (!ctx.refreshLvCadence) {
      return null;
    }

    const decisionAtMs = ctx.projectionAsOf.getTime();
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: buildP25ApdProfileLvLoaderWhere(ctx.vehicleId, decisionAtMs),
      orderBy: [{ observedAt: 'desc' }],
      take: MAX_LV_ROWS,
      select: {
        observedAt: true,
        providerTimestamp: true,
      },
    });

    const linkEnd = ctx.linkDeactivatedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const points: VsiLvCadenceEvidencePoint[] = rows
      .map((r) => ({
        observedAtMs: r.observedAt.getTime(),
        providerTimestampMs: r.providerTimestamp?.getTime() ?? null,
      }))
      .filter(
        (p) =>
          p.observedAtMs >= ctx.linkActivatedAt.getTime() &&
          p.observedAtMs <= linkEnd,
      )
      .reverse();

    return {
      points,
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      linkActivatedAtMs: ctx.linkActivatedAt.getTime(),
      linkDeactivatedAtMs: ctx.linkDeactivatedAt?.getTime() ?? null,
    };
  }

  async loadLvStandbyTransmissionEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<VsiLvStandbyTransmissionEvidenceInput | null> {
    return loadLvStandbyTransmissionEvidenceFromDb(this.prisma, ctx);
  }
}
