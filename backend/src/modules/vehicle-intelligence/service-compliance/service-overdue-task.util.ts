import { Prisma } from '@prisma/client';
import type { NextServiceComplianceDto } from './service-compliance.types';
import { buildAutomationMetadataBlock } from '@modules/tasks/automation/task-automation-rule.util';
import {
  SERVICE_OVERDUE_TASK_DEDUP_PREFIX,
  SERVICE_OVERDUE_TASK_RULE_ID,
} from './service-overdue-task.rules';

export type ServiceOdometerReliability = 'HM_OEM' | 'VEHICLE_MILEAGE' | 'UNKNOWN';

export interface ServiceOverdueVehicleFields {
  mileageKm?: number | null;
  lastServiceDate?: Date | string | null;
  lastServiceOdometerKm?: number | null;
  serviceIntervalManufacturerKm?: number | null;
  serviceIntervalManufacturerMonths?: number | null;
}

export interface ServiceOverdueTaskContext {
  vehicleLabel: string;
  overdue: boolean;
  overdueByTime: boolean;
  overdueByKm: boolean;
  overdueDays: number | null;
  overdueKm: number | null;
  remainingDays: number | null;
  remainingKm: number | null;
  hmDerivedDueDate: string | null;
  lastServiceDate: string | null;
  lastServiceOdometerKm: number | null;
  currentOdometerKm: number | null;
  odometerReliability: ServiceOdometerReliability;
  intervalKm: number | null;
  intervalMonths: number | null;
  hmDistanceFromOem: boolean;
  hmTimeFromOem: boolean;
  sourceLabel: string | null;
  trackingStatus: string;
}

export function serviceOverdueDedupKey(vehicleId: string): string {
  return `${SERVICE_OVERDUE_TASK_DEDUP_PREFIX}${vehicleId}`;
}

export function isServiceOverdueDedupKey(dedupKey: string | null | undefined): boolean {
  return !!dedupKey?.startsWith(SERVICE_OVERDUE_TASK_DEDUP_PREFIX);
}

export function buildServiceOverdueTaskContext(input: {
  vehicleLabel: string;
  nextService: NextServiceComplianceDto;
  vehicle?: ServiceOverdueVehicleFields | null;
}): ServiceOverdueTaskContext | null {
  const { nextService, vehicle } = input;
  if (nextService.trackingStatus !== 'TRACKED') return null;

  const remainingDays = nextService.timeToNextServiceDays;
  const remainingKm = nextService.distanceToNextServiceKm;
  const overdueByTime = remainingDays != null && remainingDays < 0;
  const overdueByKm = remainingKm != null && remainingKm < 0;
  const overdue = overdueByTime || overdueByKm;

  const lastServiceDate =
    vehicle?.lastServiceDate instanceof Date
      ? vehicle.lastServiceDate.toISOString()
      : typeof vehicle?.lastServiceDate === 'string'
        ? vehicle.lastServiceDate
        : null;

  let currentOdometerKm: number | null = vehicle?.mileageKm ?? null;
  let odometerReliability: ServiceOdometerReliability = 'UNKNOWN';
  if (nextService.hmDistanceFromOem && remainingKm != null) {
    odometerReliability = 'HM_OEM';
  } else if (currentOdometerKm != null) {
    odometerReliability = 'VEHICLE_MILEAGE';
  }

  return {
    vehicleLabel: input.vehicleLabel,
    overdue,
    overdueByTime,
    overdueByKm,
    overdueDays: overdueByTime && remainingDays != null ? Math.abs(remainingDays) : null,
    overdueKm: overdueByKm && remainingKm != null ? Math.abs(remainingKm) : null,
    remainingDays: remainingDays != null && remainingDays >= 0 ? remainingDays : null,
    remainingKm: remainingKm != null && remainingKm >= 0 ? remainingKm : null,
    hmDerivedDueDate: nextService.projectedDueDate ?? nextService.hmDerivedDueDate,
    lastServiceDate,
    lastServiceOdometerKm: vehicle?.lastServiceOdometerKm ?? null,
    currentOdometerKm,
    odometerReliability,
    intervalKm: vehicle?.serviceIntervalManufacturerKm ?? null,
    intervalMonths: vehicle?.serviceIntervalManufacturerMonths ?? null,
    hmDistanceFromOem: nextService.hmDistanceFromOem,
    hmTimeFromOem: nextService.hmTimeFromOem,
    sourceLabel: nextService.serviceSourceLabel,
    trackingStatus: nextService.trackingStatus,
  };
}

export function describeIntervalExceeded(ctx: ServiceOverdueTaskContext): string {
  if (ctx.overdueByTime && ctx.overdueByKm) {
    return 'Zeit- und Kilometerintervall überschritten';
  }
  if (ctx.overdueByTime) return 'Zeitintervall überschritten';
  if (ctx.overdueByKm) return 'Kilometerintervall überschritten';
  if (ctx.remainingDays != null || ctx.remainingKm != null) {
    return 'Service bald fällig';
  }
  return 'Service-Intervall prüfen';
}

export function buildServiceOverdueTaskDescription(ctx: ServiceOverdueTaskContext): string {
  const lines: string[] = [];
  const intervalLabel = describeIntervalExceeded(ctx);
  lines.push(`${ctx.vehicleLabel}: ${intervalLabel}.`);

  if (ctx.overdue) {
    const overdueParts: string[] = [];
    if (ctx.overdueDays != null) {
      overdueParts.push(
        `${ctx.overdueDays} Tag${ctx.overdueDays === 1 ? '' : 'e'} überfällig`,
      );
    }
    if (ctx.overdueKm != null) {
      overdueParts.push(
        `${ctx.overdueKm.toLocaleString('de-DE')} km überfällig`,
      );
    }
    if (overdueParts.length > 0) {
      lines.push(`Überfälligkeit: ${overdueParts.join(' · ')}.`);
    }
  } else {
    const dueParts: string[] = [];
    if (ctx.remainingDays != null) {
      dueParts.push(`noch ${ctx.remainingDays} Tag${ctx.remainingDays === 1 ? '' : 'e'}`);
    }
    if (ctx.remainingKm != null) {
      dueParts.push(`noch ${ctx.remainingKm.toLocaleString('de-DE')} km`);
    }
    if (dueParts.length > 0) {
      lines.push(`Fälligkeit: ${dueParts.join(' · ')}.`);
    }
  }

  if (ctx.hmDerivedDueDate) {
    lines.push(`Berechnete Fälligkeit: ${formatDeDate(ctx.hmDerivedDueDate)}.`);
  }
  if (ctx.lastServiceDate) {
    const odo =
      ctx.lastServiceOdometerKm != null
        ? ` bei ${ctx.lastServiceOdometerKm.toLocaleString('de-DE')} km`
        : '';
    lines.push(`Letzter bekannter Service: ${formatDeDate(ctx.lastServiceDate)}${odo}.`);
  }
  if (ctx.currentOdometerKm != null) {
    const reliability =
      ctx.odometerReliability === 'HM_OEM'
        ? 'HM/OEM'
        : ctx.odometerReliability === 'VEHICLE_MILEAGE'
          ? 'Fahrzeugstamm'
          : 'unbekannt';
    lines.push(
      `Aktueller Kilometerstand: ${ctx.currentOdometerKm.toLocaleString('de-DE')} km (${reliability}).`,
    );
  }
  if (ctx.intervalKm != null || ctx.intervalMonths != null) {
    const intervalParts: string[] = [];
    if (ctx.intervalMonths != null) {
      intervalParts.push(`${ctx.intervalMonths} Monate`);
    }
    if (ctx.intervalKm != null) {
      intervalParts.push(`${ctx.intervalKm.toLocaleString('de-DE')} km`);
    }
    lines.push(`Herstellerintervall: ${intervalParts.join(' / ')}.`);
  }
  if (ctx.sourceLabel) {
    lines.push(`Quelle: ${ctx.sourceLabel}.`);
  }

  return lines.join('\n');
}

export function buildServiceOverdueEvidenceSummary(ctx: ServiceOverdueTaskContext): string {
  const parts = [describeIntervalExceeded(ctx)];
  if (ctx.overdueDays != null) parts.push(`${ctx.overdueDays} Tage überfällig`);
  if (ctx.overdueKm != null) parts.push(`${ctx.overdueKm} km überfällig`);
  return parts.join(' · ');
}

export function buildServiceOverdueTaskMetadata(input: {
  dedupKey: string;
  insightType: string;
  insightSeverity: string;
  ctx: ServiceOverdueTaskContext;
  alertId?: string | null;
  suggestionOnly?: boolean;
  complianceSignalKind?: string;
  serviceCaseId?: string | null;
}): Prisma.InputJsonValue {
  return {
    generatedKey: input.dedupKey,
    insightType: input.insightType,
    insightSeverity: input.insightSeverity,
    suggestionOnly: input.suggestionOnly ?? false,
    allowAutoResolve: true,
    ruleId: SERVICE_OVERDUE_TASK_RULE_ID,
    evidenceSummary: buildServiceOverdueEvidenceSummary(input.ctx),
    automation: buildAutomationMetadataBlock('VEHICLE_SERVICE_OVERDUE'),
    serviceOverdue: {
      ...input.ctx,
      intervalExceeded: describeIntervalExceeded(input.ctx),
    },
    ...(input.complianceSignalKind ? { complianceSignalKind: input.complianceSignalKind } : {}),
    ...(input.alertId ? { alertId: input.alertId } : {}),
    ...(input.serviceCaseId ? { serviceCaseId: input.serviceCaseId } : {}),
  };
}

export function buildServiceOverdueTaskTitle(ctx: ServiceOverdueTaskContext): string {
  return ctx.overdue ? 'Service überfällig' : 'Service bald fällig';
}

export function shouldAutoMaterializeServiceOverdueTask(input: {
  ctx: ServiceOverdueTaskContext;
  severity: 'WARNING' | 'CRITICAL';
  suggestionOnly: boolean;
}): boolean {
  if (input.suggestionOnly) return false;
  return input.ctx.overdue && input.severity === 'CRITICAL';
}

function formatDeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
