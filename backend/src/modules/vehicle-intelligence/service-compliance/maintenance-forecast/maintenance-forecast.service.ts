import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeVin } from '../../../oneauto-provider/client/oneauto-vin.util';
import { ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU } from '../../../oneauto-provider/service-schedule/oneauto-service-schedule-eu.types';
import {
  extractOeServiceScheduleEuProviderResult,
  parseOeServiceScheduleEuProviderResult,
} from '../../../oneauto-provider/service-schedule/oneauto-oe-service-schedule-eu-provider.util';
import { SERVICE_HISTORY_EVENT_TYPES } from '../../service-events/service-events.constants';
import {
  MAINTENANCE_CONFLICT_DAYS_TOLERANCE,
  MAINTENANCE_CONFLICT_KM_TOLERANCE,
  MAINTENANCE_ODOMETER_STALE_DAYS,
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
} from '../service-compliance.config';
import { mapManualIntervalsToPositions, masterDataBaselinesFromVehicle } from './adapters/manual-interval.adapter';
import type { ManualIntervalVehicleFields } from './adapters/manual-interval.adapter';
import { mapOneAutoScheduleToPositions } from './adapters/oneauto-schedule.adapter';
import { mapServiceEventsToEvidence } from './adapters/service-event-evidence.adapter';
import { computeMaintenanceForecast } from './maintenance-forecast.engine';
import type {
  MaintenanceDataQualityFlag,
  MaintenanceForecastResult,
  MaintenanceHmSignal,
  MaintenanceOdometerReading,
  MaintenanceSchedulePosition,
} from './maintenance-forecast.types';

/** Bounded read window for history evidence (newest first). */
const EVIDENCE_EVENT_LIMIT = 200;

type VehicleForecastRow = ManualIntervalVehicleFields & {
  id: string;
  organizationId: string;
  vin: string | null;
  mileageKm: number | null;
};

/**
 * Loads forecast inputs (read-only) and runs the pure engine.
 * Never triggers provider requests — only already-stored OneAuto results are used.
 */
@Injectable()
export class MaintenanceForecastService {
  private readonly logger = new Logger(MaintenanceForecastService.name);

  constructor(private readonly prisma: PrismaService) {}

  async computeForVehicle(
    vehicleId: string,
    now: Date,
    hm: MaintenanceHmSignal | null,
  ): Promise<MaintenanceForecastResult | null> {
    const vehicle = (await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        organizationId: true,
        vin: true,
        mileageKm: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
        serviceIntervalKm: true,
        serviceIntervalMonths: true,
        oilChangeIntervalKm: true,
        oilChangeIntervalMonths: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        lastOilChangeDate: true,
        lastOilChangeOdometerKm: true,
      },
    })) as VehicleForecastRow | null;
    if (!vehicle) return null;

    const [events, odometer, schedule] = await Promise.all([
      this.loadEvidenceEvents(vehicleId),
      this.loadOdometer(vehicle),
      this.loadStoredOneAutoSchedule(vehicle),
    ]);

    const positions: MaintenanceSchedulePosition[] = [...schedule.positions];
    const coveredKinds = new Set(positions.map((p) => p.kind));
    positions.push(...mapManualIntervalsToPositions(vehicle, coveredKinds));

    return computeMaintenanceForecast({
      now,
      positions,
      unscheduledPositions: schedule.unscheduledPositions,
      events,
      masterDataBaselines: masterDataBaselinesFromVehicle(vehicle),
      odometer,
      hm,
      scheduleFlags: schedule.flags,
      scheduleFetchedAt: schedule.fetchedAt,
      thresholds: {
        warningKm: NEXT_SERVICE_WARNING_KM,
        warningDays: NEXT_SERVICE_WARNING_DAYS,
        odometerStaleDays: MAINTENANCE_ODOMETER_STALE_DAYS,
        conflictKmTolerance: MAINTENANCE_CONFLICT_KM_TOLERANCE,
        conflictDaysTolerance: MAINTENANCE_CONFLICT_DAYS_TOLERANCE,
      },
    });
  }

  private async loadEvidenceEvents(vehicleId: string) {
    try {
      const rows = await this.prisma.vehicleServiceEvent.findMany({
        where: { vehicleId, eventType: { in: SERVICE_HISTORY_EVENT_TYPES } },
        orderBy: { eventDate: 'desc' },
        take: EVIDENCE_EVENT_LIMIT,
        select: {
          id: true,
          eventType: true,
          eventDate: true,
          odometerKm: true,
          origin: true,
          sourcePayloadJson: true,
        },
      });
      return mapServiceEventsToEvidence(rows);
    } catch (err) {
      this.logger.warn(`loadEvidenceEvents(${vehicleId}) failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async loadOdometer(vehicle: VehicleForecastRow): Promise<MaintenanceOdometerReading | null> {
    try {
      const latest = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId: vehicle.id },
        select: { odometerKm: true, lastSeenAt: true, source: true },
      });
      if (latest?.odometerKm != null && Number.isFinite(latest.odometerKm) && latest.odometerKm > 0) {
        return {
          km: Math.round(latest.odometerKm),
          observedAt: latest.lastSeenAt ?? null,
          source: 'VEHICLE_LATEST_STATE',
        };
      }
    } catch (err) {
      this.logger.warn(`loadOdometer(${vehicle.id}) latest-state read failed: ${(err as Error).message}`);
    }
    if (vehicle.mileageKm != null && vehicle.mileageKm > 0) {
      return { km: vehicle.mileageKm, observedAt: null, source: 'VEHICLE_MASTER_DATA' };
    }
    return null;
  }

  /**
   * Latest SUCCEEDED `OE_SERVICE_SCHEDULE` callback result for org + vehicle + current VIN.
   * Read-only; a prior VIN's result on the same vehicle id is ignored.
   */
  private async loadStoredOneAutoSchedule(vehicle: VehicleForecastRow): Promise<{
    positions: MaintenanceSchedulePosition[];
    unscheduledPositions: Array<{ positionId: string; label: string; scheduleSource: 'ONEAUTO_SCHEDULE' }>;
    flags: MaintenanceDataQualityFlag[];
    fetchedAt: Date | null;
  }> {
    const empty = { positions: [], unscheduledPositions: [], flags: [] as MaintenanceDataQualityFlag[], fetchedAt: null };
    const vin = normalizeVin(vehicle.vin);
    if (!vin) return empty;

    try {
      const job = await this.prisma.oneAutoProviderJob.findFirst({
        where: {
          organizationId: vehicle.organizationId,
          vehicleId: vehicle.id,
          serviceSku: ONEAUTO_OE_SERVICE_SCHEDULE_EU_SERVICE_SKU,
          status: 'SUCCEEDED',
          vinSnapshot: vin,
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (!job) return empty;

      const responses = await this.prisma.oneAutoProviderResponse.findMany({
        where: { jobId: job.id },
        orderBy: { fetchedAt: 'desc' },
        select: { responseBodyJson: true, fetchedAt: true, responsePhase: true },
      });

      for (const response of responses) {
        const result = extractOeServiceScheduleEuProviderResult(response.responseBodyJson);
        if (!result) continue;
        const parsed = parseOeServiceScheduleEuProviderResult(result);
        if (parsed.kind !== 'SUCCESS_WITH_SERVICES') continue;
        if (parsed.vehicleIdentificationNumber !== vin) continue;
        const mapped = mapOneAutoScheduleToPositions({
          normalServices: parsed.normalServices,
          extraServices: parsed.extraServices,
        });
        return { ...mapped, fetchedAt: response.fetchedAt };
      }
      return empty;
    } catch (err) {
      this.logger.warn(`loadStoredOneAutoSchedule(${vehicle.id}) failed: ${(err as Error).message}`);
      return empty;
    }
  }
}
