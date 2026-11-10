import {
  baselineRefFromEvent,
  baselineRefFromMasterData,
  isAuthoritativeForecastEventSource,
} from './baseline-evidence.util';
import { addCalendarMonths, diffCalendarMonths, diffDays, startOfUtcDay } from './calendar-math.util';
import { eventCoversPosition, findLatestCoveringEvent } from './maintenance-coverage.util';
import type {
  MaintenanceBaselineRef,
  MaintenanceConflict,
  MaintenanceDataQualityFlag,
  MaintenanceDueState,
  MaintenanceEventSource,
  MaintenanceEvidenceEvent,
  MaintenanceForecastInput,
  MaintenanceForecastResult,
  MaintenancePositionForecast,
  MaintenanceSchedulePosition,
  MaintenanceScheduleSource,
  MaintenanceSeverity,
} from './maintenance-forecast.types';

/** Pseudo km/day used only to order km-only against time-based positions deterministically. */
const ORDERING_KM_PER_DAY = 50;

const DUE_STATE_RANK: Record<MaintenanceDueState, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  OK: 2,
  NO_BASELINE: 3,
  NO_INTERVAL: 4,
};

const INSPECTION_KINDS = new Set(['INSPECTION', 'INSPECTION_SMALL', 'INSPECTION_LARGE']);

function severityFor(state: MaintenanceDueState): MaintenanceSeverity {
  if (state === 'OVERDUE') return 'CRITICAL';
  if (state === 'DUE_SOON') return 'WARNING';
  if (state === 'OK') return 'GOOD';
  return 'INFO';
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function baselineFromEvent(event: MaintenanceEvidenceEvent): MaintenanceBaselineRef {
  return baselineRefFromEvent(event);
}

function latestOneAutoInspectionEvent(
  events: MaintenanceEvidenceEvent[],
  now: Date,
): MaintenanceEvidenceEvent | null {
  let best: MaintenanceEvidenceEvent | null = null;
  for (const ev of events) {
    if (ev.eventDate.getTime() > now.getTime()) continue;
    if (ev.eventSource !== 'SERVICE_EVENT_ONEAUTO') continue;
    if (ev.eventType !== 'FULL_SERVICE' && ev.eventType !== 'GENERAL_INSPECTION') continue;
    if (
      !best ||
      ev.eventDate.getTime() > best.eventDate.getTime() ||
      (ev.eventDate.getTime() === best.eventDate.getTime() &&
        (ev.odometerKm ?? -1) > (best.odometerKm ?? -1))
    ) {
      best = ev;
    }
  }
  return best;
}

/** Do not resurrect a rejected OneAuto inspection via vehicle master-data denorm. */
function inspectionMasterDataBaselineAllowed(
  position: MaintenanceSchedulePosition,
  input: MaintenanceForecastInput,
): boolean {
  if (!INSPECTION_KINDS.has(position.kind)) return true;
  const md = input.masterDataBaselines?.inspection;
  if (!md?.date && md?.odometerKm == null) return true;

  const latestOneAuto = latestOneAutoInspectionEvent(input.events, input.now);
  if (!latestOneAuto) return true;
  if (eventCoversPosition(latestOneAuto, position)) return true;

  const mdMatchesRejectedOneAuto =
    (md.date != null &&
      startOfUtcDay(md.date).getTime() === startOfUtcDay(latestOneAuto.eventDate).getTime()) ||
    (md.odometerKm != null &&
      latestOneAuto.odometerKm != null &&
      Math.abs(md.odometerKm - latestOneAuto.odometerKm) <= 50);

  return !mdMatchesRejectedOneAuto;
}

function resolveBaseline(
  position: MaintenanceSchedulePosition,
  input: MaintenanceForecastInput,
): { baseline: MaintenanceBaselineRef | null; flags: MaintenanceDataQualityFlag[] } {
  const flags: MaintenanceDataQualityFlag[] = [];
  const event = findLatestCoveringEvent(input.events, position, input.now);
  if (event) {
    return { baseline: baselineFromEvent(event), flags };
  }

  const md = input.masterDataBaselines;
  if (md) {
    // Engine-oil baselines must come from proven events — denormalized vehicle fields alone are not proof.
    const candidate = INSPECTION_KINDS.has(position.kind) ? md.inspection : null;
    if (candidate && (candidate.date || candidate.odometerKm != null)) {
      if (!inspectionMasterDataBaselineAllowed(position, input)) {
        return { baseline: null, flags };
      }
      flags.push('BASELINE_FROM_MASTER_DATA');
      return {
        baseline: baselineRefFromMasterData(candidate.date, candidate.odometerKm),
        flags,
      };
    }
  }
  return { baseline: null, flags };
}

/** Deterministic ordering key — lower is more urgent. */
function orderingKey(p: MaintenancePositionForecast): number {
  const candidates: number[] = [];
  if (p.remainingDays != null) candidates.push(p.remainingDays);
  if (p.remainingKm != null) candidates.push(p.remainingKm / ORDERING_KM_PER_DAY);
  if (candidates.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates);
}

export function compareForecastUrgency(
  a: MaintenancePositionForecast,
  b: MaintenancePositionForecast,
): number {
  const rank = DUE_STATE_RANK[a.dueState] - DUE_STATE_RANK[b.dueState];
  if (rank !== 0) return rank;
  const key = orderingKey(a) - orderingKey(b);
  if (key !== 0 && Number.isFinite(key)) return key;
  return a.positionId.localeCompare(b.positionId);
}

function forecastPosition(
  position: MaintenanceSchedulePosition,
  input: MaintenanceForecastInput,
  odometerFlags: MaintenanceDataQualityFlag[],
): MaintenancePositionForecast {
  const { now, odometer, thresholds } = input;
  const flags: MaintenanceDataQualityFlag[] = [];
  const hasKmInterval = position.intervalKm != null && position.intervalKm > 0;
  const hasTimeInterval = position.intervalMonths != null && position.intervalMonths > 0;

  const base = {
    positionId: position.positionId,
    kind: position.kind,
    label: position.label,
    intervalMode: position.intervalMode,
    intervalKm: position.intervalKm,
    intervalMonths: position.intervalMonths,
    rawIntervalDescription: position.rawIntervalDescription,
  };

  if (!hasKmInterval && !hasTimeInterval) {
    return {
      ...base,
      baseline: null,
      dueAtKm: null,
      dueAtDate: null,
      remainingKm: null,
      remainingDays: null,
      remainingMonths: null,
      dueState: 'NO_INTERVAL',
      computationMode: 'NONE',
      severity: 'INFO',
      provenance: {
        scheduleSource: position.scheduleSource,
        eventSource: 'NONE',
        odometerSource: odometer?.source ?? 'NONE',
        calculationMethod: 'NOT_COMPUTABLE',
      },
      dataQuality: ['SCHEDULE_POSITION_UNSCHEDULED'],
    };
  }

  const isAbsolute = position.intervalMode === 'ABSOLUTE_MILESTONE';
  const { baseline, flags: baselineFlags } = isAbsolute
    ? { baseline: null, flags: [] as MaintenanceDataQualityFlag[] }
    : resolveBaseline(position, input);
  flags.push(...baselineFlags);

  let dueAtKm: number | null = null;
  let dueAtDate: Date | null = null;

  if (isAbsolute) {
    if (hasKmInterval) dueAtKm = position.intervalKm!;
    if (hasTimeInterval && position.absoluteReferenceDate) {
      dueAtDate = addCalendarMonths(position.absoluteReferenceDate, position.intervalMonths!);
    }
  } else if (baseline) {
    if (hasKmInterval) {
      if (baseline.odometerKm != null) {
        dueAtKm = baseline.odometerKm + position.intervalKm!;
      } else {
        flags.push('BASELINE_ODOMETER_MISSING');
      }
    }
    if (hasTimeInterval && baseline.date) {
      dueAtDate = addCalendarMonths(new Date(baseline.date), position.intervalMonths!);
    }
  }

  const eventSource: MaintenanceEventSource = baseline?.eventSource ?? 'NONE';

  if (dueAtKm == null && dueAtDate == null) {
    return {
      ...base,
      baseline,
      dueAtKm: null,
      dueAtDate: null,
      remainingKm: null,
      remainingDays: null,
      remainingMonths: null,
      dueState: 'NO_BASELINE',
      computationMode: 'NONE',
      severity: 'INFO',
      provenance: {
        scheduleSource: position.scheduleSource,
        eventSource,
        odometerSource: odometer?.source ?? 'NONE',
        calculationMethod: 'NOT_COMPUTABLE',
      },
      dataQuality: uniq([...flags, 'HISTORY_MISSING']),
    };
  }

  let remainingKm: number | null = null;
  if (dueAtKm != null) {
    if (odometer) {
      remainingKm = Math.round(dueAtKm - odometer.km);
      flags.push(...odometerFlags);
      if (baseline?.odometerKm != null && odometer.km < baseline.odometerKm) {
        flags.push('ODOMETER_BELOW_BASELINE');
      }
    } else {
      flags.push('ODOMETER_MISSING');
    }
  }

  // Service dates are calendar dates: compare on UTC day boundaries, not wall-clock instants.
  const remainingDays = dueAtDate ? diffDays(startOfUtcDay(now), startOfUtcDay(dueAtDate)) : null;
  const remainingMonths = dueAtDate ? diffCalendarMonths(startOfUtcDay(now), startOfUtcDay(dueAtDate)) : null;

  const kmAxis = remainingKm != null;
  const timeAxis = remainingDays != null;
  const computationMode = kmAxis && timeAxis ? 'KM_AND_TIME' : kmAxis ? 'KM_ONLY' : timeAxis ? 'TIME_ONLY' : 'NONE';

  if (computationMode === 'NONE') {
    // Interval + baseline exist, but no usable odometer for a km-only position.
    return {
      ...base,
      baseline,
      dueAtKm,
      dueAtDate: null,
      remainingKm: null,
      remainingDays: null,
      remainingMonths: null,
      dueState: 'NO_BASELINE',
      computationMode,
      severity: 'INFO',
      provenance: {
        scheduleSource: position.scheduleSource,
        eventSource,
        odometerSource: 'NONE',
        calculationMethod: 'NOT_COMPUTABLE',
      },
      dataQuality: uniq(flags),
    };
  }

  const overdue = (remainingKm != null && remainingKm < 0) || (remainingDays != null && remainingDays < 0);
  const dueSoon =
    !overdue &&
    ((remainingKm != null && remainingKm <= thresholds.warningKm) ||
      (remainingDays != null && remainingDays <= thresholds.warningDays));
  const dueState: MaintenanceDueState = overdue ? 'OVERDUE' : dueSoon ? 'DUE_SOON' : 'OK';

  return {
    ...base,
    baseline,
    dueAtKm,
    dueAtDate: dueAtDate ? dueAtDate.toISOString() : null,
    remainingKm,
    remainingDays,
    remainingMonths,
    dueState,
    computationMode,
    severity: severityFor(dueState),
    provenance: {
      scheduleSource: position.scheduleSource,
      eventSource,
      odometerSource: kmAxis ? (odometer?.source ?? 'NONE') : 'NONE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    },
    dataQuality: uniq(flags),
  };
}

function odometerQualityFlags(input: MaintenanceForecastInput): MaintenanceDataQualityFlag[] {
  const { odometer, now, thresholds } = input;
  if (!odometer) return ['ODOMETER_MISSING'];
  if (!odometer.observedAt) return ['ODOMETER_TIMESTAMP_UNKNOWN'];
  if (diffDays(odometer.observedAt, now) > thresholds.odometerStaleDays) return ['ODOMETER_STALE'];
  return [];
}

function pickLastRelevantMaintenance(
  positions: MaintenancePositionForecast[],
  input: MaintenanceForecastInput,
): MaintenanceBaselineRef | null {
  const fromPositionBaselines = positions
    .filter((p) => p.baseline)
    .map((p) => p.baseline!)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  if (fromPositionBaselines[0]) return fromPositionBaselines[0];

  // No schedule positions — surface the newest authoritative regular-service event (not future-dated).
  const regular = input.events
    .filter((e) => e.eventDate.getTime() <= input.now.getTime())
    .filter((e) => isAuthoritativeForecastEventSource(e.eventSource))
    .filter((e) => ['FULL_SERVICE', 'GENERAL_INSPECTION', 'OIL_CHANGE'].includes(e.eventType))
    .filter((e) => {
      if (e.eventType === 'FULL_SERVICE' || e.eventType === 'GENERAL_INSPECTION') {
        return e.eventSource === 'SERVICE_EVENT_MANUAL' || e.performedWork.length > 0;
      }
      if (e.eventType === 'OIL_CHANGE') {
        return eventCoversPosition(e, {
          positionId: 'synthetic:oil',
          kind: 'OIL_CHANGE',
          label: 'Oil',
          intervalMode: 'RECURRING',
          intervalKm: 15_000,
          intervalMonths: 12,
          componentTerms: [],
          scheduleSource: 'MANUAL_INTERVAL',
          rawIntervalDescription: null,
        });
      }
      return false;
    })
    .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())[0];
  return regular ? baselineFromEvent(regular) : null;
}

function detectHmConflict(
  input: MaintenanceForecastInput,
  nextDue: MaintenancePositionForecast | null,
): MaintenanceConflict | null {
  const hm = input.hm;
  if (!hm || !hm.fresh || !nextDue) return null;
  if (!INSPECTION_KINDS.has(nextDue.kind) && nextDue.kind !== 'OIL_CHANGE') return null;

  const kmDelta =
    hm.distanceToNextServiceKm != null && nextDue.remainingKm != null
      ? Math.abs(hm.distanceToNextServiceKm - nextDue.remainingKm)
      : null;
  const dayDelta =
    hm.timeToNextServiceDays != null && nextDue.remainingDays != null
      ? Math.abs(hm.timeToNextServiceDays - nextDue.remainingDays)
      : null;

  const conflict =
    (kmDelta != null && kmDelta > input.thresholds.conflictKmTolerance) ||
    (dayDelta != null && dayDelta > input.thresholds.conflictDaysTolerance);
  if (!conflict) return null;

  return {
    code: 'CONFLICT_HM_VS_COMPUTED',
    positionId: nextDue.positionId,
    hmRemainingKm: hm.distanceToNextServiceKm,
    computedRemainingKm: nextDue.remainingKm,
    hmRemainingDays: hm.timeToNextServiceDays,
    computedRemainingDays: nextDue.remainingDays,
  };
}

/**
 * Deterministic, provider-agnostic maintenance forecast.
 * Pure function: same input → same output. No I/O, no LLM.
 */
export function computeMaintenanceForecast(input: MaintenanceForecastInput): MaintenanceForecastResult {
  const odometerFlags = odometerQualityFlags(input);
  const positions = input.positions
    .map((p) => forecastPosition(p, input, odometerFlags))
    .sort(compareForecastUrgency);

  const computable = positions.filter((p) => p.dueState === 'OVERDUE' || p.dueState === 'DUE_SOON' || p.dueState === 'OK');
  const nextDue = computable[0] ?? null;

  const conflicts: MaintenanceConflict[] = [];
  const hmConflict = detectHmConflict(input, nextDue);
  if (hmConflict) conflicts.push(hmConflict);
  for (const p of positions) {
    if (p.dataQuality.includes('ODOMETER_BELOW_BASELINE')) {
      conflicts.push({
        code: 'ODOMETER_BELOW_BASELINE',
        positionId: p.positionId,
        hmRemainingKm: null,
        computedRemainingKm: p.remainingKm,
        hmRemainingDays: null,
        computedRemainingDays: p.remainingDays,
      });
    }
  }

  const globalFlags: MaintenanceDataQualityFlag[] = [
    ...(input.scheduleFlags ?? []),
    ...(input.evidenceLoadFlags ?? []),
  ];
  if (input.positions.length === 0) globalFlags.push('SCHEDULE_MISSING');
  if (input.events.length === 0 && !input.masterDataBaselines?.inspection.date && !input.masterDataBaselines?.oilChange.date) {
    globalFlags.push('HISTORY_MISSING');
  }
  if (input.positions.some((p) => p.intervalKm != null)) globalFlags.push(...odometerFlags);
  if (hmConflict) globalFlags.push('CONFLICT_HM_VS_COMPUTED');

  const latestEvent = input.events
    .filter((e) => e.eventDate.getTime() <= input.now.getTime())
    .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())[0];

  const scheduleSources = uniq<MaintenanceScheduleSource>([
    ...input.positions.map((p) => p.scheduleSource),
    ...(input.hm?.fresh ? (['HM_OEM'] as MaintenanceScheduleSource[]) : []),
  ]);
  const eventSources = uniq<MaintenanceEventSource>(
    positions.map((p) => p.provenance.eventSource).filter((s) => s !== 'NONE'),
  );

  return {
    computedAt: input.now.toISOString(),
    positions,
    unscheduledPositions: input.unscheduledPositions ?? [],
    nextDue,
    lastRelevantMaintenance: pickLastRelevantMaintenance(positions, input),
    hmOem: input.hm,
    odometer: input.odometer
      ? {
          km: input.odometer.km,
          observedAt: input.odometer.observedAt?.toISOString() ?? null,
          source: input.odometer.source,
        }
      : null,
    conflicts,
    dataQuality: uniq(globalFlags),
    freshness: {
      odometerObservedAt: input.odometer?.observedAt?.toISOString() ?? null,
      scheduleFetchedAt: input.scheduleFetchedAt?.toISOString() ?? null,
      hmLastUpdatedAt: input.hm?.lastUpdatedAt ?? null,
      latestEventDate: latestEvent?.eventDate.toISOString() ?? null,
    },
    scheduleSources,
    eventSources,
  };
}
