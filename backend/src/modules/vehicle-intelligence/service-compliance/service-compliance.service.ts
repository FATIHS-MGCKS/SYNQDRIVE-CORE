import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { HmSignalUsageService } from '../../high-mobility/high-mobility-signal-usage.service';
import {
  FULL_SERVICE_BASELINE_EVENT_TYPES,
  SERVICE_HISTORY_EVENT_TYPES,
} from '../service-events/service-events.constants';
import {
  HM_OEM_SERVICE_FRESHNESS_MS,
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
  TUV_BOKRAFT_WARNING_DAYS,
} from './service-compliance.config';
import type {
  ComplianceTaskSignalDto,
  NextServiceComplianceDto,
  ServiceComplianceEvaluation,
  ServiceComplianceSeverity,
  TuvBokraftComplianceDto,
} from './service-compliance.types';
import { buildComplianceTaskSignals } from './service-compliance-operational.signals';
import type { ComplianceOperationalVehicle } from './service-compliance-operational.signals';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.44;
/** UI cap for Service & Compliance history list (full count still in hasServiceHistory). */
const SERVICE_HISTORY_UI_LIMIT = 100;

function extractPerformedActionsFromSourcePayload(sourcePayloadJson: unknown): string[] {
  if (!sourcePayloadJson || typeof sourcePayloadJson !== 'object' || Array.isArray(sourcePayloadJson)) {
    return [];
  }
  const actions = (sourcePayloadJson as Record<string, unknown>).service_actions;
  if (!Array.isArray(actions)) return [];
  return actions.map((item) => String(item).trim()).filter(Boolean);
}

export interface VehicleComplianceFields {
  lastTuvDate: Date | null;
  nextTuvDate: Date | null;
  lastBokraftDate: Date | null;
  nextBokraftDate: Date | null;
}

export interface ServiceInfoStatusDto {
  nextService: NextServiceComplianceDto;
  hasServiceHistory: boolean;
  serviceRemainingPercent: number | null;
  serviceRemainingKm: number | null;
  serviceRemainingMonths: number | null;
  serviceRemainingDays: number | null;
  serviceOverdue: boolean;
  serviceOverdueDays: number | null;
  serviceOverdueKm: number | null;
  serviceDueImminently: boolean;
  /** @deprecated Interval metadata only — not used for next-service calculation. */
  intervalKm: number | null;
  /** @deprecated Interval metadata only — not used for next-service calculation. */
  intervalMonths: number | null;
  lastServiceDate: string | null;
  lastServiceOdometer: number | null;
  lastServiceWorkshop: string | null;
  tuvValidTill: string | null;
  tuvRemainingMonths: number | null;
  tuvRemainingDays: number | null;
  tuvOverdue: boolean;
  tuvLastDate: string | null;
  bokraftValidTill: string | null;
  bokraftRemainingMonths: number | null;
  bokraftRemainingDays: number | null;
  bokraftOverdue: boolean;
  bokraftLastDate: string | null;
  serviceHistory: Array<{
    id: string;
    eventType: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
    origin: string;
    provider: string | null;
    providerServiceType: string | null;
    performedActions: string[];
    externalSource: boolean;
  }>;
  tuvHistory: Array<{
    id: string;
    eventType: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
  }>;
  bokraftHistory: Array<{
    id: string;
    eventType: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
  }>;
  /** Actionable task signals derived from canonical compliance (HM/OEM + TÜV/BOKraft). */
  taskSignals: ComplianceTaskSignalDto[];
  /** @deprecated Use nextService.trackingStatus === 'TRACKED'. */
  hmServiceSource: boolean;
  /** @deprecated Use nextService.lastUpdatedAt. */
  hmLastUpdatedAt: string | null;
  /** @deprecated Use nextService.hmDistanceFromOem. */
  hmDistanceFromOem: boolean;
  /** @deprecated Use nextService.hmTimeFromOem. */
  hmTimeFromOem: boolean;
  /** @deprecated Use hasServiceHistory. */
  hasServiceBaseline: boolean;
}

export interface RentalServiceModuleHealthInput {
  state: 'good' | 'warning' | 'critical' | 'unknown';
  reason: string;
  last_updated_at: string | null;
  data_stale: boolean;
}

@Injectable()
export class ServiceComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hm: HmSignalUsageService,
  ) {}

  isHmServiceFresh(lastUpdatedAt: string | Date | null | undefined, now = Date.now()): boolean {
    if (!lastUpdatedAt) return false;
    const ts = lastUpdatedAt instanceof Date ? lastUpdatedAt.getTime() : new Date(lastUpdatedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return now - ts <= HM_OEM_SERVICE_FRESHNESS_MS;
  }

  /** Canonical HM/OEM next-service evaluation — no interval math. */
  async evaluateNextService(vehicleId: string, now = new Date()): Promise<NextServiceComplianceDto> {
    const noTracking = (message: string): NextServiceComplianceDto => ({
      trackingStatus: 'NO_TRACKING',
      source: null,
      distanceToNextServiceKm: null,
      timeToNextServiceDays: null,
      lastUpdatedAt: null,
      serviceSourceLabel: null,
      severity: 'INFO',
      blocksRental: false,
      title: 'Kein Service-Tracking',
      description: 'Nächster Service nur über HM/OEM verfügbar.',
      message,
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
    });

    const stale = (
      lastUpdatedAt: string | null,
      message: string,
    ): NextServiceComplianceDto => ({
      trackingStatus: 'STALE',
      source: 'HM_OEM',
      distanceToNextServiceKm: null,
      timeToNextServiceDays: null,
      lastUpdatedAt,
      serviceSourceLabel: 'HM/OEM (veraltet)',
      severity: 'INFO',
      blocksRental: false,
      title: 'Service-Daten veraltet',
      description: 'HM/OEM-Servicewerte sind älter als 7 Tage und werden nicht als aktive Wahrheit genutzt.',
      message,
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
    });

    let hmActive = false;
    try {
      hmActive = await this.hm.isHmHealthActive(vehicleId);
    } catch {
      return noTracking('HM/OEM Health nicht aktiv — kein Next-Service-Tracking.');
    }
    if (!hmActive) {
      return noTracking('HM/OEM Health nicht aktiv — kein Next-Service-Tracking.');
    }

    const hmService = await this.hm.getServiceInfoSignals(vehicleId).catch(() => null);
    if (!hmService) {
      return noTracking('Keine HM/OEM-Service-Signale empfangen.');
    }

    const hasKm = hmService.distanceToNextServiceKm != null;
    const hasDays = hmService.timeToNextServiceDays != null;
    if (!hasKm && !hasDays) {
      return noTracking('OEM liefert aktuell keine Restlaufzeit bis zum nächsten Service.');
    }

    const lastUpdatedAt = hmService.lastUpdatedAt ?? null;
    if (!this.isHmServiceFresh(lastUpdatedAt, now.getTime())) {
      return stale(
        lastUpdatedAt,
        'HM/OEM-Servicewerte sind veraltet (>7 Tage) — Next Service nicht als aktiv bewertet.',
      );
    }

    const distanceKm = hasKm ? Math.round(hmService.distanceToNextServiceKm!) : null;
    const timeDays = hasDays ? Math.round(hmService.timeToNextServiceDays!) : null;
    const severity = this.severityFromHmValues(distanceKm, timeDays);
    const overdueByDays = timeDays != null && timeDays < 0;
    const overdueByKm = distanceKm != null && distanceKm < 0;
    const overdue = overdueByDays || overdueByKm;

    const title =
      severity === 'CRITICAL'
        ? 'Service überfällig'
        : severity === 'WARNING'
          ? 'Service fällig'
          : 'Service in Ordnung';

    const message = this.buildNextServiceMessage(distanceKm, timeDays, overdue);
    const hmDerivedDueDate =
      timeDays != null
        ? new Date(now.getTime() + timeDays * MS_PER_DAY).toISOString()
        : null;

    return {
      trackingStatus: 'TRACKED',
      source: 'HM_OEM',
      distanceToNextServiceKm: distanceKm,
      timeToNextServiceDays: timeDays,
      lastUpdatedAt,
      serviceSourceLabel: 'HM/OEM',
      severity,
      blocksRental: false,
      title,
      description: 'Next Service aus OEM-Telemetrie (HM).',
      message,
      hmDistanceFromOem: hasKm,
      hmTimeFromOem: hasDays,
      hmDerivedDueDate,
    };
  }

  evaluateTuvBokraft(vehicle: VehicleComplianceFields, now = new Date()): TuvBokraftComplianceDto {
    const tuvValidTill = vehicle.nextTuvDate ?? null;
    const bokraftValidTill = vehicle.nextBokraftDate ?? null;

    const tuvRemainingMonths = tuvValidTill
      ? Math.round((tuvValidTill.getTime() - now.getTime()) / (DAYS_PER_MONTH * MS_PER_DAY))
      : null;
    const bokraftRemainingMonths = bokraftValidTill
      ? Math.round((bokraftValidTill.getTime() - now.getTime()) / (DAYS_PER_MONTH * MS_PER_DAY))
      : null;
    const tuvRemainingDays = tuvValidTill
      ? Math.floor((tuvValidTill.getTime() - now.getTime()) / MS_PER_DAY)
      : null;
    const bokraftRemainingDays = bokraftValidTill
      ? Math.floor((bokraftValidTill.getTime() - now.getTime()) / MS_PER_DAY)
      : null;

    return {
      tuvValidTill: tuvValidTill?.toISOString() ?? null,
      tuvRemainingMonths,
      tuvRemainingDays,
      tuvOverdue: tuvRemainingDays != null && tuvRemainingDays < 0,
      tuvLastDate: vehicle.lastTuvDate?.toISOString() ?? null,
      bokraftValidTill: bokraftValidTill?.toISOString() ?? null,
      bokraftRemainingMonths,
      bokraftRemainingDays,
      bokraftOverdue: bokraftRemainingDays != null && bokraftRemainingDays < 0,
      bokraftLastDate: vehicle.lastBokraftDate?.toISOString() ?? null,
    };
  }

  async evaluateCompliance(
    vehicleId: string,
    vehicle: VehicleComplianceFields,
    now = new Date(),
  ): Promise<ServiceComplianceEvaluation> {
    const nextService = await this.evaluateNextService(vehicleId, now);
    const tuvBokraft = this.evaluateTuvBokraft(vehicle, now);
    return { nextService, tuvBokraft };
  }

  /** Task/action signals for Health UI and insight→task bridge — no duplicate interval math. */
  buildTaskSignals(
    vehicle: ComplianceOperationalVehicle,
    evaluation: ServiceComplianceEvaluation,
  ): ComplianceTaskSignalDto[] {
    return buildComplianceTaskSignals(vehicle, evaluation);
  }

  toRentalModuleHealth(
    evaluation: ServiceComplianceEvaluation,
    lastServiceDate: Date | null,
    nextTuvDate: Date | null,
    nextBokraftDate: Date | null,
    lastTuvDate: Date | null,
    lastBokraftDate: Date | null,
  ): RentalServiceModuleHealthInput {
    const { nextService, tuvBokraft } = evaluation;

    if (tuvBokraft.tuvOverdue && tuvBokraft.tuvRemainingDays != null) {
      const days = Math.abs(tuvBokraft.tuvRemainingDays);
      return {
        state: 'critical',
        reason: `TÜV abgelaufen seit ${days} Tag${days === 1 ? '' : 'en'}`,
        last_updated_at: lastTuvDate?.toISOString() ?? nextTuvDate?.toISOString() ?? null,
        data_stale: false,
      };
    }
    if (tuvBokraft.bokraftOverdue && tuvBokraft.bokraftRemainingDays != null) {
      const days = Math.abs(tuvBokraft.bokraftRemainingDays);
      return {
        state: 'critical',
        reason: `BOKraft abgelaufen seit ${days} Tag${days === 1 ? '' : 'en'}`,
        last_updated_at: lastBokraftDate?.toISOString() ?? nextBokraftDate?.toISOString() ?? null,
        data_stale: false,
      };
    }

    if (
      tuvBokraft.tuvRemainingDays != null &&
      tuvBokraft.tuvRemainingDays >= 0 &&
      tuvBokraft.tuvRemainingDays <= TUV_BOKRAFT_WARNING_DAYS
    ) {
      return {
        state: 'warning',
        reason: `TÜV läuft in ${tuvBokraft.tuvRemainingDays} Tag${tuvBokraft.tuvRemainingDays === 1 ? '' : 'en'} ab`,
        last_updated_at: nextTuvDate?.toISOString() ?? null,
        data_stale: false,
      };
    }
    if (
      tuvBokraft.bokraftRemainingDays != null &&
      tuvBokraft.bokraftRemainingDays >= 0 &&
      tuvBokraft.bokraftRemainingDays <= TUV_BOKRAFT_WARNING_DAYS
    ) {
      return {
        state: 'warning',
        reason: `BOKraft läuft in ${tuvBokraft.bokraftRemainingDays} Tag${tuvBokraft.bokraftRemainingDays === 1 ? '' : 'en'} ab`,
        last_updated_at: nextBokraftDate?.toISOString() ?? null,
        data_stale: false,
      };
    }

    if (nextService.trackingStatus === 'TRACKED') {
      if (nextService.severity === 'CRITICAL') {
        return {
          state: 'critical',
          reason: nextService.message,
          last_updated_at: nextService.lastUpdatedAt,
          data_stale: false,
        };
      }
      if (nextService.severity === 'WARNING') {
        return {
          state: 'warning',
          reason: nextService.message,
          last_updated_at: nextService.lastUpdatedAt,
          data_stale: false,
        };
      }
    }

    const hasComplianceDates = nextTuvDate != null || nextBokraftDate != null;
    if (!hasComplianceDates && nextService.trackingStatus === 'NO_TRACKING') {
      return {
        state: 'unknown',
        reason: 'Kein HM/OEM Service-Tracking und keine Compliance-Termine',
        last_updated_at: null,
        data_stale: true,
      };
    }

    if (nextService.trackingStatus === 'STALE') {
      return {
        state: 'unknown',
        reason: nextService.message,
        last_updated_at: nextService.lastUpdatedAt,
        data_stale: true,
      };
    }

    return {
      state: 'good',
      reason:
        nextService.trackingStatus === 'TRACKED'
          ? nextService.message
          : 'Compliance-Termine gültig',
      last_updated_at:
        nextService.lastUpdatedAt ??
        lastServiceDate?.toISOString() ??
        nextTuvDate?.toISOString() ??
        nextBokraftDate?.toISOString() ??
        null,
      data_stale: false,
    };
  }

  async buildServiceInfoStatus(vehicleId: string): Promise<ServiceInfoStatusDto> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
        homeStationId: true,
        mileageKm: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
      },
    });

    const [serviceEvents, fullServiceEvents, tuvEvents, bokraftEvents, compliance, historyCount, baselineCount] =
      await Promise.all([
      this.prisma.vehicleServiceEvent.findMany({
        where: {
          vehicleId,
          eventType: { in: SERVICE_HISTORY_EVENT_TYPES },
        },
        orderBy: { eventDate: 'desc' },
        take: SERVICE_HISTORY_UI_LIMIT,
      }),
      this.prisma.vehicleServiceEvent.findMany({
        where: {
          vehicleId,
          eventType: { in: FULL_SERVICE_BASELINE_EVENT_TYPES },
        },
        orderBy: { eventDate: 'desc' },
        take: 1,
      }),
      this.prisma.vehicleServiceEvent.findMany({
        where: { vehicleId, eventType: 'TUV_INSPECTION' },
        orderBy: { eventDate: 'desc' },
        take: 10,
      }),
      this.prisma.vehicleServiceEvent.findMany({
        where: { vehicleId, eventType: 'BOKRAFT_INSPECTION' },
        orderBy: { eventDate: 'desc' },
        take: 10,
      }),
      this.evaluateCompliance(vehicleId, {
        lastTuvDate: vehicle?.lastTuvDate ?? null,
        nextTuvDate: vehicle?.nextTuvDate ?? null,
        lastBokraftDate: vehicle?.lastBokraftDate ?? null,
        nextBokraftDate: vehicle?.nextBokraftDate ?? null,
      }),
      this.prisma.vehicleServiceEvent.count({
        where: {
          vehicleId,
          eventType: { in: SERVICE_HISTORY_EVENT_TYPES },
        },
      }),
      this.prisma.vehicleServiceEvent.count({
        where: {
          vehicleId,
          eventType: { in: FULL_SERVICE_BASELINE_EVENT_TYPES },
        },
      }),
    ]);

    const latestFullServiceEvent = fullServiceEvents[0] ?? null;
    const lastServiceDate =
      latestFullServiceEvent?.eventDate ?? vehicle?.lastServiceDate ?? null;
    const lastServiceOdometer =
      latestFullServiceEvent?.odometerKm ?? vehicle?.lastServiceOdometerKm ?? null;
    const hasServiceHistory = historyCount > 0;
    const hasServiceBaseline =
      baselineCount > 0 ||
      vehicle?.lastServiceDate != null ||
      vehicle?.lastServiceOdometerKm != null;

    const mapEvent = (e: {
      id: string;
      eventType: string;
      eventDate: Date;
      odometerKm: number | null;
      workshopName: string | null;
      notes: string | null;
      origin: string;
      provider: string | null;
      sourcePayloadJson: unknown;
    }) => {
      const performedActions = extractPerformedActionsFromSourcePayload(e.sourcePayloadJson);
      const providerServiceType =
        e.sourcePayloadJson &&
        typeof e.sourcePayloadJson === 'object' &&
        !Array.isArray(e.sourcePayloadJson) &&
        typeof (e.sourcePayloadJson as Record<string, unknown>).service_type === 'string'
          ? String((e.sourcePayloadJson as Record<string, unknown>).service_type)
          : null;
      return {
        id: e.id,
        eventType: e.eventType,
        date: e.eventDate.toISOString(),
        odometerKm: e.odometerKm,
        workshopName: e.workshopName,
        notes: e.notes,
        origin: e.origin,
        provider: e.provider,
        providerServiceType,
        performedActions,
        externalSource: e.origin === 'ONEAUTO',
      };
    };

    const { nextService, tuvBokraft } = compliance;
    const tracked = nextService.trackingStatus === 'TRACKED';

    const serviceRemainingKm = tracked ? nextService.distanceToNextServiceKm : null;
    const serviceRemainingDays = tracked ? nextService.timeToNextServiceDays : null;
    const serviceRemainingMonths =
      tracked && serviceRemainingDays != null
        ? Math.round(serviceRemainingDays / DAYS_PER_MONTH)
        : null;

    const serviceOverdueByDays = serviceRemainingDays != null && serviceRemainingDays < 0;
    const serviceOverdueByKm = serviceRemainingKm != null && serviceRemainingKm < 0;
    const serviceOverdue = tracked && (serviceOverdueByDays || serviceOverdueByKm);
    const serviceOverdueDays =
      tracked && serviceOverdueByDays ? Math.abs(serviceRemainingDays!) : null;
    const serviceOverdueKm =
      tracked && serviceOverdueByKm ? Math.abs(serviceRemainingKm!) : null;
    const serviceDueImminently =
      tracked &&
      !serviceOverdue &&
      ((serviceRemainingDays != null &&
        serviceRemainingDays >= 0 &&
        serviceRemainingDays <= NEXT_SERVICE_WARNING_DAYS) ||
        (serviceRemainingKm != null &&
          serviceRemainingKm >= 0 &&
          serviceRemainingKm <= NEXT_SERVICE_WARNING_KM));

    return {
      nextService,
      hasServiceHistory,
      hasServiceBaseline,
      serviceRemainingPercent: null,
      serviceRemainingKm,
      serviceRemainingMonths,
      serviceRemainingDays,
      serviceOverdue,
      serviceOverdueDays,
      serviceOverdueKm,
      serviceDueImminently,
      intervalKm: vehicle?.serviceIntervalManufacturerKm ?? null,
      intervalMonths: vehicle?.serviceIntervalManufacturerMonths ?? null,
      lastServiceDate: lastServiceDate?.toISOString?.() ?? null,
      lastServiceOdometer,
      lastServiceWorkshop: latestFullServiceEvent?.workshopName ?? null,
      tuvValidTill: tuvBokraft.tuvValidTill,
      tuvRemainingMonths: tuvBokraft.tuvRemainingMonths,
      tuvRemainingDays: tuvBokraft.tuvRemainingDays,
      tuvOverdue: tuvBokraft.tuvOverdue,
      tuvLastDate: tuvBokraft.tuvLastDate,
      bokraftValidTill: tuvBokraft.bokraftValidTill,
      bokraftRemainingMonths: tuvBokraft.bokraftRemainingMonths,
      bokraftRemainingDays: tuvBokraft.bokraftRemainingDays,
      bokraftOverdue: tuvBokraft.bokraftOverdue,
      bokraftLastDate: tuvBokraft.bokraftLastDate,
      serviceHistory: serviceEvents.map(mapEvent),
      tuvHistory: tuvEvents.map(mapEvent),
      bokraftHistory: bokraftEvents.map(mapEvent),
      hmServiceSource: tracked,
      hmLastUpdatedAt: nextService.lastUpdatedAt,
      hmDistanceFromOem: nextService.hmDistanceFromOem,
      hmTimeFromOem: nextService.hmTimeFromOem,
      taskSignals: this.buildTaskSignals(
        {
          id: vehicleId,
          make: vehicle?.make ?? '',
          model: vehicle?.model ?? '',
          licensePlate: vehicle?.licensePlate ?? null,
          homeStationId: vehicle?.homeStationId ?? null,
          mileageKm: vehicle?.mileageKm ?? null,
          lastServiceDate: vehicle?.lastServiceDate ?? null,
          lastServiceOdometerKm: vehicle?.lastServiceOdometerKm ?? null,
          serviceIntervalManufacturerKm: vehicle?.serviceIntervalManufacturerKm ?? null,
          serviceIntervalManufacturerMonths: vehicle?.serviceIntervalManufacturerMonths ?? null,
        } satisfies ComplianceOperationalVehicle,
        compliance,
      ),
    };
  }

  private severityFromHmValues(
    distanceKm: number | null,
    timeDays: number | null,
  ): ServiceComplianceSeverity {
    const daySeverity = this.severityFromDays(timeDays);
    const kmSeverity = this.severityFromKm(distanceKm);
    return this.stricterSeverity(daySeverity, kmSeverity);
  }

  private severityFromDays(days: number | null): ServiceComplianceSeverity | null {
    if (days == null) return null;
    if (days < 0) return 'CRITICAL';
    if (days <= NEXT_SERVICE_WARNING_DAYS) return 'WARNING';
    return 'GOOD';
  }

  private severityFromKm(km: number | null): ServiceComplianceSeverity | null {
    if (km == null) return null;
    if (km < 0) return 'CRITICAL';
    if (km <= NEXT_SERVICE_WARNING_KM) return 'WARNING';
    return 'GOOD';
  }

  private stricterSeverity(
    a: ServiceComplianceSeverity | null,
    b: ServiceComplianceSeverity | null,
  ): ServiceComplianceSeverity {
    const rank: Record<ServiceComplianceSeverity, number> = {
      INFO: 0,
      GOOD: 1,
      WARNING: 2,
      CRITICAL: 3,
    };
    const pick = (s: ServiceComplianceSeverity | null): ServiceComplianceSeverity =>
      s ?? 'GOOD';
    return rank[pick(a)] >= rank[pick(b)] ? pick(a) : pick(b);
  }

  private buildNextServiceMessage(
    distanceKm: number | null,
    timeDays: number | null,
    overdue: boolean,
  ): string {
    if (overdue) {
      const parts: string[] = [];
      if (timeDays != null && timeDays < 0) {
        parts.push(`${Math.abs(timeDays)} Tag${Math.abs(timeDays) === 1 ? '' : 'en'}`);
      }
      if (distanceKm != null && distanceKm < 0) {
        parts.push(`${Math.abs(distanceKm).toLocaleString('de-DE')} km`);
      }
      const suffix = parts.length > 0 ? ` seit ${parts.join(' / ')}` : '';
      return `Service überfällig${suffix} (HM/OEM)`;
    }
    const parts: string[] = [];
    if (timeDays != null && timeDays >= 0) {
      parts.push(`noch ${timeDays} Tag${timeDays === 1 ? '' : 'en'}`);
    }
    if (distanceKm != null && distanceKm >= 0) {
      parts.push(`noch ${distanceKm.toLocaleString('de-DE')} km`);
    }
    if (parts.length === 0) return 'Service-Tracking aktiv (HM/OEM)';
    return `Nächster Service: ${parts.join(' / ')} (HM/OEM)`;
  }
}
