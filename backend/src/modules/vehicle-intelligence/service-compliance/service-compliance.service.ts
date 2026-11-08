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
import {
  clampServiceHistoryPageLimit,
  decodeServiceHistoryCursor,
  encodeServiceHistoryCursor,
  SERVICE_HISTORY_PAGE_DEFAULT_LIMIT,
} from './service-history-pagination.util';
import { MaintenanceForecastService } from './maintenance-forecast/maintenance-forecast.service';
import type {
  MaintenanceForecastResult,
  MaintenanceHmSignal,
  MaintenancePositionForecast,
} from './maintenance-forecast/maintenance-forecast.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30.44;
/** UI cap for Service & Compliance history list (full count still in hasServiceHistory). */
const SERVICE_HISTORY_UI_LIMIT = SERVICE_HISTORY_PAGE_DEFAULT_LIMIT;

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
  /** Provider-agnostic deterministic forecast per maintenance position (V2). */
  maintenanceForecast: MaintenanceForecastResult | null;
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
  /** Total persisted service-history events (all pages). */
  serviceHistoryTotalCount: number;
  /** True when more events exist beyond the first page. */
  serviceHistoryHasMore: boolean;
  /** Opaque cursor for GET service-history-page (next page). */
  serviceHistoryNextCursor: string | null;
}

export interface ServiceHistoryPageDto {
  items: ServiceInfoStatusDto['serviceHistory'];
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface RentalServiceModuleHealthInput {
  state: 'good' | 'warning' | 'critical' | 'unknown';
  reason: string;
  last_updated_at: string | null;
  data_stale: boolean;
}

export interface NextServiceEvaluationDetailed {
  nextService: NextServiceComplianceDto;
  forecast: MaintenanceForecastResult | null;
}

@Injectable()
export class ServiceComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hm: HmSignalUsageService,
    private readonly maintenanceForecast: MaintenanceForecastService,
  ) {}

  isHmServiceFresh(lastUpdatedAt: string | Date | null | undefined, now = Date.now()): boolean {
    if (!lastUpdatedAt) return false;
    const ts = lastUpdatedAt instanceof Date ? lastUpdatedAt.getTime() : new Date(lastUpdatedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    return now - ts <= HM_OEM_SERVICE_FRESHNESS_MS;
  }

  /** Canonical next-service evaluation (HM OEM when fresh, otherwise deterministic computed forecast). */
  async evaluateNextService(vehicleId: string, now = new Date()): Promise<NextServiceComplianceDto> {
    const detailed = await this.evaluateNextServiceDetailed(vehicleId, now);
    return detailed.nextService;
  }

  /**
   * Full evaluation incl. the per-position forecast.
   * Precedence: fresh HM/OEM measured values are the headline; the computed forecast is attached
   * as comparison (conflicts made visible). Without fresh HM the computed forecast is the headline.
   */
  async evaluateNextServiceDetailed(vehicleId: string, now = new Date()): Promise<NextServiceEvaluationDetailed> {
    const hm = await this.readHmSignal(vehicleId, now);
    const forecast = await this.maintenanceForecast
      .computeForVehicle(vehicleId, now, hm.signal)
      .catch(() => null);

    if (hm.kind === 'TRACKED') {
      return { nextService: this.decorateHmTracked(hm.dto, forecast), forecast };
    }

    const computed = forecast?.nextDue ?? null;
    if (computed) {
      return { nextService: this.buildComputedNextService(computed, forecast!, now), forecast };
    }

    if (hm.kind === 'STALE') {
      return { nextService: this.attachForecastMeta(hm.dto, forecast), forecast };
    }

    return { nextService: this.attachForecastMeta(this.buildNoBasisNextService(forecast, hm.message), forecast), forecast };
  }

  private async readHmSignal(
    vehicleId: string,
    now: Date,
  ): Promise<
    | { kind: 'TRACKED'; dto: NextServiceComplianceDto; signal: MaintenanceHmSignal }
    | { kind: 'STALE'; dto: NextServiceComplianceDto; signal: MaintenanceHmSignal }
    | { kind: 'NONE'; message: string; signal: null }
  > {
    let hmActive = false;
    try {
      hmActive = await this.hm.isHmHealthActive(vehicleId);
    } catch {
      return { kind: 'NONE', message: 'HM/OEM Health nicht aktiv.', signal: null };
    }
    if (!hmActive) {
      return { kind: 'NONE', message: 'HM/OEM Health nicht aktiv.', signal: null };
    }

    const hmService = await this.hm.getServiceInfoSignals(vehicleId).catch(() => null);
    if (!hmService) {
      return { kind: 'NONE', message: 'Keine HM/OEM-Service-Signale empfangen.', signal: null };
    }

    const hasKm = hmService.distanceToNextServiceKm != null;
    const hasDays = hmService.timeToNextServiceDays != null;
    if (!hasKm && !hasDays) {
      return {
        kind: 'NONE',
        message: 'OEM liefert aktuell keine Restlaufzeit bis zum nächsten Service.',
        signal: null,
      };
    }

    const lastUpdatedAt = hmService.lastUpdatedAt ?? null;
    const distanceKm = hasKm ? Math.round(hmService.distanceToNextServiceKm!) : null;
    const timeDays = hasDays ? Math.round(hmService.timeToNextServiceDays!) : null;

    if (!this.isHmServiceFresh(lastUpdatedAt, now.getTime())) {
      const signal: MaintenanceHmSignal = {
        distanceToNextServiceKm: distanceKm,
        timeToNextServiceDays: timeDays,
        lastUpdatedAt,
        fresh: false,
      };
      return {
        kind: 'STALE',
        signal,
        dto: {
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
          message: 'HM/OEM-Servicewerte sind veraltet (>7 Tage) — Next Service nicht als aktiv bewertet.',
          hmDistanceFromOem: false,
          hmTimeFromOem: false,
          hmDerivedDueDate: null,
          projectedDueDate: null,
          positionKind: null,
          positionId: null,
          provenance: null,
          dataQuality: [],
          conflicts: [],
          computedComparison: null,
        },
      };
    }

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

    const message = this.buildNextServiceMessage(distanceKm, timeDays, overdue, 'HM/OEM');
    const hmDerivedDueDate =
      timeDays != null ? new Date(now.getTime() + timeDays * MS_PER_DAY).toISOString() : null;

    const signal: MaintenanceHmSignal = {
      distanceToNextServiceKm: distanceKm,
      timeToNextServiceDays: timeDays,
      lastUpdatedAt,
      fresh: true,
    };

    return {
      kind: 'TRACKED',
      signal,
      dto: {
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
        projectedDueDate: hmDerivedDueDate,
        positionKind: 'INSPECTION',
        positionId: null,
        provenance: {
          scheduleSource: 'HM_OEM',
          eventSource: 'NONE',
          odometerSource: 'HM_OEM',
          calculationMethod: 'OEM_REMAINING',
        },
        dataQuality: [],
        conflicts: [],
        computedComparison: null,
      },
    };
  }

  private decorateHmTracked(
    dto: NextServiceComplianceDto,
    forecast: MaintenanceForecastResult | null,
  ): NextServiceComplianceDto {
    if (!forecast) return dto;
    const computed = forecast.nextDue;
    const conflicts = forecast.conflicts.filter((c) => c.code === 'CONFLICT_HM_VS_COMPUTED');
    return {
      ...dto,
      conflicts,
      dataQuality: conflicts.length > 0 ? ['CONFLICT_HM_VS_COMPUTED'] : [],
      computedComparison:
        computed && computed.provenance.scheduleSource !== 'HM_OEM'
          ? {
              source: this.computedSourceFor(computed),
              positionId: computed.positionId,
              remainingKm: computed.remainingKm,
              remainingDays: computed.remainingDays,
              projectedDueDate: computed.dueAtDate,
            }
          : null,
    };
  }

  private attachForecastMeta(
    dto: NextServiceComplianceDto,
    forecast: MaintenanceForecastResult | null,
  ): NextServiceComplianceDto {
    if (!forecast) return dto;
    return { ...dto, dataQuality: forecast.dataQuality, conflicts: forecast.conflicts };
  }

  private computedSourceFor(position: MaintenancePositionForecast): 'COMPUTED_ONEAUTO_SCHEDULE' | 'COMPUTED_MANUAL_INTERVAL' {
    return position.provenance.scheduleSource === 'ONEAUTO_SCHEDULE'
      ? 'COMPUTED_ONEAUTO_SCHEDULE'
      : 'COMPUTED_MANUAL_INTERVAL';
  }

  private buildComputedNextService(
    position: MaintenancePositionForecast,
    forecast: MaintenanceForecastResult,
    now: Date,
  ): NextServiceComplianceDto {
    const source = this.computedSourceFor(position);
    const sourceLabel =
      source === 'COMPUTED_ONEAUTO_SCHEDULE'
        ? 'OneAuto API · Berechnet durch SYNQDRIVE'
        : 'Manuelle Wartungsangaben · Berechnet durch SYNQDRIVE';
    const severity: ServiceComplianceSeverity = position.severity;
    const overdue = position.dueState === 'OVERDUE';
    const title =
      severity === 'CRITICAL'
        ? 'Service überfällig'
        : severity === 'WARNING'
          ? 'Service fällig'
          : 'Service in Ordnung';
    const message = this.buildNextServiceMessage(
      position.remainingKm,
      position.remainingDays,
      overdue,
      'berechnet',
    );
    const lastUpdatedAt =
      forecast.freshness.odometerObservedAt ??
      forecast.freshness.latestEventDate ??
      forecast.freshness.scheduleFetchedAt ??
      now.toISOString();

    return {
      trackingStatus: 'TRACKED',
      source,
      distanceToNextServiceKm: position.remainingKm,
      timeToNextServiceDays: position.remainingDays,
      lastUpdatedAt,
      serviceSourceLabel: sourceLabel,
      severity,
      blocksRental: false,
      title,
      description: 'Deterministisch berechnet aus Wartungsplan und nachgewiesener Historie.',
      message,
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
      projectedDueDate: position.dueAtDate,
      positionKind: position.kind,
      positionId: position.positionId,
      provenance: position.provenance,
      dataQuality: position.dataQuality,
      conflicts: forecast.conflicts.filter((c) => c.positionId === position.positionId),
      computedComparison: null,
    };
  }

  private buildNoBasisNextService(
    forecast: MaintenanceForecastResult | null,
    hmMessage: string,
  ): NextServiceComplianceDto {
    const hasSchedule = (forecast?.positions.length ?? 0) > 0;
    const hasHistory = forecast?.lastRelevantMaintenance != null;
    const message = hasSchedule
      ? 'Wartungsplan vorhanden, aber kein nachgewiesener letzter Service — Service-Nachweis hinterlegen.'
      : hasHistory
        ? 'Service-Historie vorhanden, aber kein Wartungsplan — Intervalle hinterlegen.'
        : `Keine Berechnungsgrundlage (${hmMessage}) — Wartungsplan und Service-Nachweis hinterlegen.`;
    return {
      trackingStatus: 'NO_TRACKING',
      source: null,
      distanceToNextServiceKm: null,
      timeToNextServiceDays: null,
      lastUpdatedAt: null,
      serviceSourceLabel: null,
      severity: 'INFO',
      blocksRental: false,
      title: 'Keine Service-Prognose',
      description: 'Nächster Service wird aus OEM-Werten oder aus Wartungsplan und nachgewiesener Historie bestimmt.',
      message,
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
      projectedDueDate: null,
      positionKind: null,
      positionId: null,
      provenance: null,
      dataQuality: forecast?.dataQuality ?? [],
      conflicts: [],
      computedComparison: null,
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
        reason: 'Keine Service-Prognose und keine Compliance-Termine',
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

    const [serviceEvents, fullServiceEvents, tuvEvents, bokraftEvents, detailed, historyCount, baselineCount] =
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
      this.evaluateNextServiceDetailed(vehicleId),
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

    const compliance: ServiceComplianceEvaluation = {
      nextService: detailed.nextService,
      tuvBokraft: this.evaluateTuvBokraft({
        lastTuvDate: vehicle?.lastTuvDate ?? null,
        nextTuvDate: vehicle?.nextTuvDate ?? null,
        lastBokraftDate: vehicle?.lastBokraftDate ?? null,
        nextBokraftDate: vehicle?.nextBokraftDate ?? null,
      }),
    };

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
      maintenanceForecast: detailed.forecast,
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
      serviceHistory: serviceEvents.map((e) => this.mapServiceHistoryEvent(e)),
      tuvHistory: tuvEvents.map(mapEvent),
      bokraftHistory: bokraftEvents.map(mapEvent),
      serviceHistoryTotalCount: historyCount,
      serviceHistoryHasMore: historyCount > serviceEvents.length,
      serviceHistoryNextCursor:
        historyCount > serviceEvents.length && serviceEvents.length > 0
          ? encodeServiceHistoryCursor({
              eventDateIso: serviceEvents[serviceEvents.length - 1]!.eventDate.toISOString(),
              id: serviceEvents[serviceEvents.length - 1]!.id,
            })
          : null,
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

  async listServiceHistoryPage(
    vehicleId: string,
    input?: { cursor?: string; limit?: number },
  ): Promise<ServiceHistoryPageDto> {
    const limit = clampServiceHistoryPageLimit(input?.limit);
    const decoded = input?.cursor ? decodeServiceHistoryCursor(input.cursor) : null;
    if (input?.cursor && !decoded) {
      return { items: [], totalCount: 0, hasMore: false, nextCursor: null };
    }

    const whereBase = {
      vehicleId,
      eventType: { in: SERVICE_HISTORY_EVENT_TYPES },
    } as const;

    const cursorFilter =
      decoded != null
        ? {
            OR: [
              { eventDate: { lt: new Date(decoded.eventDateIso) } },
              {
                eventDate: new Date(decoded.eventDateIso),
                id: { lt: decoded.id },
              },
            ],
          }
        : {};

    const [totalCount, rows] = await Promise.all([
      this.prisma.vehicleServiceEvent.count({ where: whereBase }),
      this.prisma.vehicleServiceEvent.findMany({
        where: { ...whereBase, ...cursorFilter },
        orderBy: [{ eventDate: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          eventType: true,
          eventDate: true,
          odometerKm: true,
          workshopName: true,
          notes: true,
          origin: true,
          provider: true,
          sourcePayloadJson: true,
        },
      }),
    ]);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((e) => this.mapServiceHistoryEvent(e)),
      totalCount,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeServiceHistoryCursor({ eventDateIso: last.eventDate.toISOString(), id: last.id })
          : null,
    };
  }

  private mapServiceHistoryEvent(e: {
    id: string;
    eventType: string;
    eventDate: Date;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
    origin: string;
    provider: string | null;
    sourcePayloadJson: unknown;
  }): ServiceInfoStatusDto['serviceHistory'][number] {
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
    sourceSuffix: string,
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
      return `Service überfällig${suffix} (${sourceSuffix})`;
    }
    const parts: string[] = [];
    if (timeDays != null && timeDays >= 0) {
      parts.push(`noch ${timeDays} Tag${timeDays === 1 ? '' : 'en'}`);
    }
    if (distanceKm != null && distanceKm >= 0) {
      parts.push(`noch ${distanceKm.toLocaleString('de-DE')} km`);
    }
    if (parts.length === 0) return `Service-Tracking aktiv (${sourceSuffix})`;
    return `Nächster Service: ${parts.join(' / ')} (${sourceSuffix})`;
  }
}
