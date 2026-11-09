import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import type { InsightCandidate } from '../../business-insights/insight.types';
import {
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
  TUV_BOKRAFT_WARNING_DAYS,
} from './service-compliance.config';
import type {
  ComplianceTaskSignalDto,
  NextServiceComplianceDto,
  ServiceComplianceEvaluation,
} from './service-compliance.types';
import { isComputedServiceSource } from './service-compliance.types';
import {
  buildServiceOverdueTaskContext,
  buildServiceOverdueTaskDescription,
  buildServiceOverdueTaskTitle,
} from './service-overdue-task.util';

export interface ComplianceOperationalVehicle {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
  homeStationId: string | null;
  mileageKm?: number | null;
  lastServiceDate?: Date | null;
  lastServiceOdometerKm?: number | null;
  serviceIntervalManufacturerKm?: number | null;
  serviceIntervalManufacturerMonths?: number | null;
}

const NO_TRACKING_INFO_TITLE = 'Keine Service-Prognose verfügbar';
const NO_TRACKING_INFO_MESSAGE =
  'Für dieses Fahrzeug liegen weder OEM-Servicewerte noch Wartungsplan mit nachgewiesenem Service vor. Wartungsplan oder Service-Nachweis hinterlegen.';

/** Human source attribution for reasons/messages — never mixes OEM and computed values. */
export function describeServiceSignalSource(nextService: NextServiceComplianceDto): string {
  switch (nextService.source) {
    case 'HM_OEM':
      return 'Quelle: HM/OEM';
    case 'COMPUTED_ONEAUTO_SCHEDULE':
      return 'Quelle: OneAuto API · Berechnet durch SYNQDRIVE';
    case 'COMPUTED_MANUAL_INTERVAL':
      return 'Quelle: Manuelle Wartungsangaben · Berechnet durch SYNQDRIVE';
    default:
      return 'Quelle: unbekannt';
  }
}

/**
 * V1 policy (SEC-DEC-004): only fresh HM/OEM overdue may auto-materialize a task.
 * Computed forecasts (schedule + history) are suggestions — operators confirm manually.
 */
export function isAutoMaterializableServiceSource(nextService: NextServiceComplianceDto): boolean {
  return nextService.source === 'HM_OEM';
}

function vehicleLabel(v: ComplianceOperationalVehicle): string {
  return v.licensePlate || `${v.make} ${v.model}`;
}

/** Task / action signals for Health UI — derived only from canonical compliance evaluation. */
export function buildComplianceTaskSignals(
  vehicle: ComplianceOperationalVehicle,
  evaluation: ServiceComplianceEvaluation,
): ComplianceTaskSignalDto[] {
  const vehicleId = vehicle.id;
  const signals: ComplianceTaskSignalDto[] = [];
  const { nextService, tuvBokraft } = evaluation;
  const label = vehicleLabel(vehicle);

  const push = (
    partial: Omit<ComplianceTaskSignalDto, 'signalKey' | 'dedupeKey' | 'serviceOverdueContext'> & {
      dedupeBase: string;
      serviceOverdueContext?: ComplianceTaskSignalDto['serviceOverdueContext'];
    },
  ) => {
    const dedupeKey = `${partial.dedupeBase}:${vehicleId}`;
    const { dedupeBase: _, ...rest } = partial;
    signals.push({ ...rest, signalKey: dedupeKey, dedupeKey });
  };

  if (nextService.trackingStatus === 'TRACKED') {
    const serviceCtx = buildServiceOverdueTaskContext({
      vehicleLabel: label,
      nextService,
      vehicle,
    });
    const overdue = nextService.severity === 'CRITICAL';
    const dueSoon =
      nextService.severity === 'WARNING' &&
      !overdue &&
      ((nextService.timeToNextServiceDays != null &&
        nextService.timeToNextServiceDays >= 0 &&
        nextService.timeToNextServiceDays <= NEXT_SERVICE_WARNING_DAYS) ||
        (nextService.distanceToNextServiceKm != null &&
          nextService.distanceToNextServiceKm >= 0 &&
          nextService.distanceToNextServiceKm <= NEXT_SERVICE_WARNING_KM));

    if (overdue && serviceCtx) {
      push({
        dedupeBase: 'service_overdue',
        kind: 'SERVICE_URGENT',
        insightType: InsightType.SERVICE_OVERDUE,
        title: buildServiceOverdueTaskTitle(serviceCtx),
        message: buildServiceOverdueTaskDescription(serviceCtx),
        actionLabel: 'Service terminieren',
        severity: 'CRITICAL',
        suggestionOnly: !isAutoMaterializableServiceSource(nextService),
        blocksRental: false,
        dueDate: nextService.projectedDueDate ?? nextService.hmDerivedDueDate,
        category: 'Maintenance',
        taskType: 'VEHICLE_SERVICE',
        serviceOverdueContext: serviceCtx,
      });
    } else if (dueSoon && serviceCtx) {
      push({
        dedupeBase: 'service_overdue',
        kind: 'SERVICE_SCHEDULE',
        insightType: InsightType.SERVICE_OVERDUE,
        title: buildServiceOverdueTaskTitle(serviceCtx),
        message: buildServiceOverdueTaskDescription(serviceCtx),
        actionLabel: 'Service terminieren',
        severity: 'WARNING',
        suggestionOnly: true,
        blocksRental: false,
        dueDate: nextService.projectedDueDate ?? nextService.hmDerivedDueDate,
        category: 'Maintenance',
        taskType: 'VEHICLE_SERVICE',
        serviceOverdueContext: serviceCtx,
      });
    }
  }

  const tuvDays = tuvBokraft.tuvRemainingDays;
  if (tuvBokraft.tuvValidTill != null && tuvDays != null) {
    if (tuvBokraft.tuvOverdue) {
      push({
        dedupeBase: 'tuv_overdue',
        kind: 'TUV_URGENT',
        insightType: InsightType.TUV_OVERDUE,
        title: 'TÜV sofort klären',
        message: `TÜV abgelaufen seit ${Math.abs(tuvDays)} Tag${Math.abs(tuvDays) === 1 ? '' : 'en'} — Fahrzeug nicht vermieten.`,
        actionLabel: 'TÜV Termin planen',
        severity: 'CRITICAL',
        suggestionOnly: false,
        blocksRental: true,
        dueDate: tuvBokraft.tuvValidTill,
        category: 'TÜV',
        taskType: 'VEHICLE_INSPECTION',
      });
    } else if (tuvDays <= TUV_BOKRAFT_WARNING_DAYS) {
      push({
        dedupeBase: 'tuv_overdue',
        kind: 'TUV_SCHEDULE',
        insightType: InsightType.TUV_OVERDUE,
        title: 'TÜV Termin planen',
        message: `TÜV fällig in ${tuvDays} Tag${tuvDays === 1 ? '' : 'en'}.`,
        actionLabel: 'TÜV Termin planen',
        severity: 'WARNING',
        suggestionOnly: true,
        blocksRental: false,
        dueDate: tuvBokraft.tuvValidTill,
        category: 'TÜV',
        taskType: 'VEHICLE_INSPECTION',
      });
    }
  }

  const bokDays = tuvBokraft.bokraftRemainingDays;
  if (tuvBokraft.bokraftValidTill != null && bokDays != null) {
    if (tuvBokraft.bokraftOverdue) {
      push({
        dedupeBase: 'bokraft_overdue',
        kind: 'BOKRAFT_URGENT',
        insightType: InsightType.BOKRAFT_OVERDUE,
        title: 'BOKraft sofort klären',
        message: `BOKraft abgelaufen seit ${Math.abs(bokDays)} Tag${Math.abs(bokDays) === 1 ? '' : 'en'} — Fahrzeug nicht vermieten.`,
        actionLabel: 'BOKraft Termin planen',
        severity: 'CRITICAL',
        suggestionOnly: false,
        blocksRental: true,
        dueDate: tuvBokraft.bokraftValidTill,
        category: 'BOKraft',
        taskType: 'VEHICLE_INSPECTION',
      });
    } else if (bokDays <= TUV_BOKRAFT_WARNING_DAYS) {
      push({
        dedupeBase: 'bokraft_overdue',
        kind: 'BOKRAFT_SCHEDULE',
        insightType: InsightType.BOKRAFT_OVERDUE,
        title: 'BOKraft Termin planen',
        message: `BOKraft fällig in ${bokDays} Tag${bokDays === 1 ? '' : 'en'}.`,
        actionLabel: 'BOKraft Termin planen',
        severity: 'WARNING',
        suggestionOnly: true,
        blocksRental: false,
        dueDate: tuvBokraft.bokraftValidTill,
        category: 'BOKraft',
        taskType: 'VEHICLE_INSPECTION',
      });
    }
  }

  return signals;
}

/** Insight candidates for business-insights detectors — single source of compliance truth. */
export function buildComplianceInsightCandidates(
  vehicle: ComplianceOperationalVehicle,
  evaluation: ServiceComplianceEvaluation,
  opts: {
    now: Date;
    enabledTypes: InsightType[];
  },
): InsightCandidate[] {
  const label = vehicleLabel(vehicle);
  const candidates: InsightCandidate[] = [];
  const { nextService, tuvBokraft } = evaluation;

  if (opts.enabledTypes.includes(InsightType.SERVICE_OVERDUE) && nextService.trackingStatus === 'TRACKED') {
    const remainingDays = nextService.timeToNextServiceDays;
    const remainingKm = nextService.distanceToNextServiceKm;
    const overdue = nextService.severity === 'CRITICAL';
    const imminent =
      nextService.severity === 'WARNING' &&
      !overdue &&
      ((remainingDays != null &&
        remainingDays >= 0 &&
        remainingDays <= NEXT_SERVICE_WARNING_DAYS) ||
        (remainingKm != null &&
          remainingKm >= 0 &&
          remainingKm <= NEXT_SERVICE_WARNING_KM));

    const operationalOverdue = overdue && isAutoMaterializableServiceSource(nextService);
    if (operationalOverdue || imminent) {
      const reasons: string[] = [];
      let severity: InsightSeverity;
      let title: string;
      let message: string;
      let priority: number;

      if (overdue) {
        severity = InsightSeverity.CRITICAL;
        title = 'Service überfällig';
        const serviceCtx = buildServiceOverdueTaskContext({
          vehicleLabel: label,
          nextService,
          vehicle,
        });
        message = serviceCtx
          ? buildServiceOverdueTaskDescription(serviceCtx)
          : `${label}: ${nextService.message} — Service sofort vereinbaren.`;
        priority = 85;
        if (remainingDays != null && remainingDays < 0) {
          reasons.push(`Überfällig seit ${Math.abs(remainingDays)} Tagen`);
        }
        if (remainingKm != null && remainingKm < 0) {
          reasons.push(`Überfällig seit ${Math.abs(remainingKm).toLocaleString('de-DE')} km`);
        }
      } else {
        severity = InsightSeverity.WARNING;
        title = 'Service bald fällig';
        message = `${label}: ${nextService.message} — Werkstatttermin planen.`;
        priority = 65;
        if (remainingDays != null && remainingDays >= 0) {
          reasons.push(`Noch ${remainingDays} Tage`);
        }
        if (remainingKm != null && remainingKm >= 0) {
          reasons.push(`Noch ${remainingKm.toLocaleString('de-DE')} km`);
        }
      }
      reasons.push(describeServiceSignalSource(nextService));
      if (isComputedServiceSource(nextService.source)) {
        reasons.push('Berechnet aus Wartungsplan und nachgewiesener Historie');
      }

      const timeContext: Record<string, string> = {};
      if (nextService.lastUpdatedAt) timeContext.lastHmUpdate = nextService.lastUpdatedAt;
      const dueDate = nextService.projectedDueDate ?? nextService.hmDerivedDueDate;
      if (dueDate) timeContext.dueDate = dueDate;

      candidates.push({
        type: InsightType.SERVICE_OVERDUE,
        severity,
        priority,
        title,
        message,
        actionLabel: overdue ? 'Service dringend prüfen' : 'Service terminieren',
        actionType: 'navigate_vehicle',
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [vehicle.id],
        timeContext,
        metrics: {
          remainingDays: remainingDays ?? 'unknown',
          remainingKm: remainingKm ?? 'unknown',
          trackingStatus: nextService.trackingStatus,
          source: nextService.source ?? 'unknown',
          suggestionOnly: !overdue || !isAutoMaterializableServiceSource(nextService),
          serviceOverdue: buildServiceOverdueTaskContext({
            vehicleLabel: label,
            nextService,
            vehicle,
          }),
        },
        reasons,
        confidence: 0.9,
        dedupeKey: `service_overdue:${vehicle.id}`,
        groupKey: vehicle.homeStationId
          ? `service_overdue:${vehicle.homeStationId}`
          : 'service_overdue_fleet',
      });
    }
  }

  if (
    opts.enabledTypes.includes(InsightType.HM_SERVICE_NO_TRACKING) &&
    nextService.trackingStatus === 'NO_TRACKING'
  ) {
    candidates.push({
      type: InsightType.HM_SERVICE_NO_TRACKING,
      severity: InsightSeverity.INFO,
      priority: 20,
      title: NO_TRACKING_INFO_TITLE,
      message: `${label}: ${NO_TRACKING_INFO_MESSAGE}`,
      actionLabel: undefined,
      actionType: 'navigate_vehicle',
      entityScope: InsightEntityScope.VEHICLE,
      entityIds: [vehicle.id],
      metrics: { trackingStatus: 'NO_TRACKING' },
      reasons: ['Kein HM/OEM Next-Service-Signal'],
      confidence: 0.85,
      dedupeKey: `hm_no_tracking:${vehicle.id}`,
      groupKey: vehicle.homeStationId
        ? `hm_no_tracking:${vehicle.homeStationId}`
        : 'hm_no_tracking_fleet',
    });
  }

  const complianceKinds: {
    type: InsightType;
    key: string;
    label: string;
    validTill: string | null;
    remainingDays: number | null;
    overdue: boolean;
  }[] = [
    {
      type: InsightType.TUV_OVERDUE,
      key: 'tuv_overdue',
      label: 'TÜV',
      validTill: tuvBokraft.tuvValidTill,
      remainingDays: tuvBokraft.tuvRemainingDays,
      overdue: tuvBokraft.tuvOverdue,
    },
    {
      type: InsightType.BOKRAFT_OVERDUE,
      key: 'bokraft_overdue',
      label: 'BOKraft',
      validTill: tuvBokraft.bokraftValidTill,
      remainingDays: tuvBokraft.bokraftRemainingDays,
      overdue: tuvBokraft.bokraftOverdue,
    },
  ];

  for (const kind of complianceKinds) {
    if (!opts.enabledTypes.includes(kind.type)) continue;
    if (kind.validTill == null || kind.remainingDays == null) continue;

    const days = kind.remainingDays;
    const overdue = kind.overdue;
    const imminent = !overdue && days <= TUV_BOKRAFT_WARNING_DAYS;
    if (!overdue && !imminent) continue;

    const reasons: string[] = [];
    let severity: InsightSeverity;
    let title: string;
    let message: string;
    let priority: number;

    if (overdue) {
      const overdueDays = Math.abs(days);
      severity = InsightSeverity.CRITICAL;
      title = `${kind.label} überfällig`;
      message = `${label}: ${kind.label} überfällig seit ${overdueDays} Tag${overdueDays === 1 ? '' : 'en'} — Termin sofort vereinbaren, Betrieb nicht zulässig.`;
      priority = 88;
      reasons.push(`Überfällig seit ${overdueDays} Tag${overdueDays === 1 ? '' : 'en'}`);
    } else {
      severity = InsightSeverity.WARNING;
      title = `${kind.label} bald fällig`;
      message = `${label}: ${kind.label} fällig in ${days} Tag${days === 1 ? '' : 'en'} — Termin rechtzeitig planen.`;
      priority = 66;
      reasons.push(`Noch ${days} Tag${days === 1 ? '' : 'en'}`);
    }

    candidates.push({
      type: kind.type,
      severity,
      priority,
      title,
      message,
      actionLabel: overdue ? `${kind.label} sofort klären` : `${kind.label} Termin planen`,
      actionType: 'navigate_vehicle',
      entityScope: InsightEntityScope.VEHICLE,
      entityIds: [vehicle.id],
      timeContext: { dueDate: kind.validTill },
      metrics: { remainingDays: days },
      reasons,
      confidence: 0.95,
      dedupeKey: `${kind.key}:${vehicle.id}`,
      groupKey: vehicle.homeStationId ? `${kind.key}:${vehicle.homeStationId}` : `${kind.key}_fleet`,
    });
  }

  return candidates;
}

export { NO_TRACKING_INFO_MESSAGE, NO_TRACKING_INFO_TITLE };
