import type { OneAutoOeServiceScheduleService } from '../../../../oneauto-provider/service-schedule/oneauto-service-schedule-eu.types';
import { extractComponentKeys, isEngineOilChangeWorkItem, normalizeWorkText } from '../maintenance-coverage.util';
import type {
  MaintenanceDataQualityFlag,
  MaintenancePositionKind,
  MaintenanceSchedulePosition,
} from '../maintenance-forecast.types';

export interface OneAutoScheduleAdapterResult {
  positions: MaintenanceSchedulePosition[];
  unscheduledPositions: Array<{ positionId: string; label: string; scheduleSource: 'ONEAUTO_SCHEDULE' }>;
  flags: MaintenanceDataQualityFlag[];
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function taskTexts(service: OneAutoOeServiceScheduleService): string[] {
  const tasks = Array.isArray(service.service_tasks) ? service.service_tasks : [];
  return tasks
    .map((t) => [t.task_description, t.task_action, t.vehicle_position].filter((x): x is string => typeof x === 'string').join(' '))
    .map(normalizeWorkText)
    .filter(Boolean);
}

function fingerprint(service: OneAutoOeServiceScheduleService, tasks: string[]): string {
  return [
    normalizeWorkText(String(service.service_interval_desc ?? '')),
    service.service_months ?? '',
    service.service_kms ?? '',
    normalizeWorkText(String(service.service_description ?? '')),
    [...tasks].sort().join('|'),
  ].join('#');
}

function isAncillaryEngineOilServiceTask(text: string): boolean {
  if (isEngineOilChangeWorkItem(text)) return true;
  const t = normalizeWorkText(text);
  const ancillary = ['oil filter', 'ölfilter', 'sealing plug', 'sump', 'drain plug', 'ölwanne', 'dichtung'];
  return ancillary.some((a) => t.includes(a)) && (t.includes('oil') || t.includes('öl'));
}

/** Tasks that are not engine-oil service (checks, unrelated components, transmission oil, etc.). */
function isNonEngineOilOnlyTask(text: string): boolean {
  return !isEngineOilChangeWorkItem(text) && !isAncillaryEngineOilServiceTask(text);
}

/**
 * OIL_CHANGE only when every task is engine-oil service (incl. filter/plug). Mixed inspection → INSPECTION.
 * INSPECTION_SMALL / INSPECTION_LARGE are never inferred from OneAuto schedule fields (SEC-DEC-002).
 */
function classifyNormalService(tasks: string[]): MaintenancePositionKind {
  if (tasks.length === 0) return 'INSPECTION';
  const hasEngineOil = tasks.some((task) => isEngineOilChangeWorkItem(task));
  if (!hasEngineOil) return 'INSPECTION';
  if (tasks.some(isNonEngineOilOnlyTask)) return 'INSPECTION';
  return 'OIL_CHANGE';
}

function componentTermsFor(service: OneAutoOeServiceScheduleService, tasks: string[]): string[] {
  const keys = new Set<string>();
  for (const key of extractComponentKeys(String(service.service_description ?? ''))) keys.add(key);
  for (const task of tasks) for (const key of extractComponentKeys(task)) keys.add(key);
  return Array.from(keys).sort();
}

function labelFor(service: OneAutoOeServiceScheduleService, kind: MaintenancePositionKind): string {
  const desc = typeof service.service_description === 'string' ? service.service_description.trim() : '';
  if (desc) return desc;
  const interval = typeof service.service_interval_desc === 'string' ? service.service_interval_desc.trim() : '';
  if (interval) return interval;
  return kind;
}

/**
 * Maps a parsed OneAuto `OE_SERVICE_SCHEDULE` result to canonical maintenance positions.
 *
 * - `service_kms` / `service_months` are RECURRING intervals (SEC-DEC-002); each axis is optional.
 * - Positions without any numeric interval are reported as unscheduled, never forecast.
 * - Identical variant groups are collapsed by fingerprint and flagged.
 */
export function mapOneAutoScheduleToPositions(input: {
  normalServices: OneAutoOeServiceScheduleService[];
  extraServices: OneAutoOeServiceScheduleService[];
}): OneAutoScheduleAdapterResult {
  const positions: MaintenanceSchedulePosition[] = [];
  const unscheduled: OneAutoScheduleAdapterResult['unscheduledPositions'] = [];
  const seen = new Set<string>();
  let collapsed = false;

  const handle = (service: OneAutoOeServiceScheduleService, group: 'normal' | 'extra', index: number) => {
    const tasks = taskTexts(service);
    const fp = fingerprint(service, tasks);
    if (seen.has(fp)) {
      collapsed = true;
      return;
    }
    seen.add(fp);

    const serviceId =
      typeof service.service_id === 'string' && service.service_id.trim()
        ? service.service_id.trim()
        : `${group}-${index}`;
    const positionId = `oneauto:${serviceId}`;
    const intervalKm = toPositiveInt(service.service_kms);
    const intervalMonths = toPositiveInt(service.service_months);
    const kind: MaintenancePositionKind = group === 'normal' ? classifyNormalService(tasks) : 'OTHER';
    const label = labelFor(service, kind);

    if (intervalKm == null && intervalMonths == null) {
      unscheduled.push({ positionId, label, scheduleSource: 'ONEAUTO_SCHEDULE' });
      return;
    }

    positions.push({
      positionId,
      kind,
      label,
      intervalMode: 'RECURRING',
      intervalKm,
      intervalMonths,
      componentTerms: kind === 'OTHER' ? componentTermsFor(service, tasks) : [],
      scheduleSource: 'ONEAUTO_SCHEDULE',
      rawIntervalDescription:
        typeof service.service_interval_desc === 'string' ? service.service_interval_desc : null,
    });
  };

  input.normalServices.forEach((s, i) => handle(s, 'normal', i));
  input.extraServices.forEach((s, i) => handle(s, 'extra', i));

  const flags: MaintenanceDataQualityFlag[] = [];
  if (collapsed) flags.push('SCHEDULE_VARIANTS_COLLAPSED');
  if (unscheduled.length > 0) flags.push('SCHEDULE_POSITION_UNSCHEDULED');

  return { positions, unscheduledPositions: unscheduled, flags };
}
