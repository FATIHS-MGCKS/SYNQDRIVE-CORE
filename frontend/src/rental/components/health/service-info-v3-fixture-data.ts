import type { MaintenanceForecastResult, MaintenancePositionForecast, ServiceInfoStatus } from '../../../lib/api';

export function baseForecast(partial: Partial<MaintenanceForecastResult>): MaintenanceForecastResult {
  return {
    computedAt: '2026-01-15T10:00:00.000Z',
    positions: [],
    unscheduledPositions: [],
    nextDue: null,
    lastRelevantMaintenance: null,
    odometer: { km: 48200, source: 'VEHICLE_LATEST_STATE', observedAt: '2026-01-14T08:00:00.000Z' },
    scheduleSources: [],
    eventSources: ['SERVICE_EVENT_ONEAUTO'],
    dataQuality: [],
    conflicts: [],
    hmOem: null,
    freshness: {
      odometerObservedAt: '2026-01-14T08:00:00.000Z',
      scheduleFetchedAt: '2026-01-15T09:00:00.000Z',
      hmLastUpdatedAt: null,
      latestEventDate: '2025-06-01',
    },
    ...partial,
  };
}

function position(partial: Partial<MaintenancePositionForecast> & Pick<MaintenancePositionForecast, 'positionId' | 'kind' | 'label' | 'dueState'>): MaintenancePositionForecast {
  return {
    intervalMode: 'RECURRING',
    intervalKm: 30000,
    intervalMonths: 24,
    rawIntervalDescription: null,
    baseline: { date: '2024-01-01', odometerKm: 30000, eventId: 'e1', eventType: 'FULL_SERVICE', eventSource: 'SERVICE_EVENT_ONEAUTO' },
    dueAtKm: 60000,
    dueAtDate: '2026-06-01',
    remainingKm: 5000,
    remainingDays: 60,
    remainingMonths: 2,
    computationMode: 'KM_AND_TIME',
    severity: 'INFO',
    provenance: {
      scheduleSource: 'ONEAUTO_SCHEDULE',
      eventSource: 'SERVICE_EVENT_ONEAUTO',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    },
    dataQuality: [],
    ...partial,
  };
}

/** Arteon-like full plan for visual QA (responsive + dark). */
export function arteonFixtureServiceInfo(): ServiceInfoStatus {
  const headlineId = 'p-inspection-headline';
  const overdueHeadline = position({
    positionId: headlineId,
    kind: 'INSPECTION',
    label: 'Hauptinspektion mit sehr langem Provider-Bezeichnerstext aus OneAuto Schedule',
    dueState: 'OVERDUE',
    remainingKm: -800,
    remainingDays: -21,
    rawIntervalDescription: 'Inspection Service A / B mit Langtext',
  });

  const noBaselineMany: MaintenancePositionForecast[] = Array.from({ length: 4 }, (_, i) =>
    position({
      positionId: `p-nobase-${i}`,
      kind: 'OTHER',
      label: `Zusatzarbeit ${i + 1} — langer OEM-Provider-Name der umbrechen muss`,
      dueState: 'NO_BASELINE',
      baseline: null,
      dueAtKm: null,
      dueAtDate: null,
      remainingKm: null,
      remainingDays: null,
      provenance: {
        scheduleSource: 'ONEAUTO_SCHEDULE',
        eventSource: 'NONE',
        odometerSource: 'VEHICLE_LATEST_STATE',
        calculationMethod: 'NOT_COMPUTABLE',
      },
      dataQuality: [],
    }),
  );

  return {
    hasServiceHistory: true,
    hasServiceBaseline: true,
    maintenanceForecast: baseForecast({
      scheduleSources: ['ONEAUTO_SCHEDULE'],
      positions: [
        overdueHeadline,
        position({ positionId: 'p-soon', kind: 'OIL_CHANGE', label: 'Ölwechsel', dueState: 'DUE_SOON', remainingKm: 400, remainingDays: 5 }),
        position({ positionId: 'p-ok', kind: 'INSPECTION_SMALL', label: 'Kleininspektion', dueState: 'OK' }),
        ...noBaselineMany,
      ],
      nextDue: overdueHeadline,
      unscheduledPositions: [{ positionId: 'u1', label: 'Position ohne eigenes Intervall', scheduleSource: 'ONEAUTO_SCHEDULE' }],
      conflicts: [
        {
          code: 'CONFLICT_HM_VS_COMPUTED',
          positionId: headlineId,
          hmRemainingKm: 1200,
          computedRemainingKm: -800,
          hmRemainingDays: 10,
          computedRemainingDays: -21,
        },
      ],
    }),
    nextService: {
      trackingStatus: 'TRACKED',
      source: 'COMPUTED_ONEAUTO_SCHEDULE',
      positionId: headlineId,
      positionKind: 'INSPECTION',
      positionLabel: 'Nächste Inspektion',
      remainingKm: -800,
      remainingDays: -21,
      dueImminent: true,
      overdue: true,
      stale: false,
      computedComparison: null,
    },
    serviceOverdue: true,
    serviceDueImminently: true,
    serviceRemainingDays: -21,
    serviceRemainingKm: -800,
    tuvOverdue: false,
    bokraftOverdue: false,
  } as unknown as ServiceInfoStatus;
}

/** Mercedes-like: history present, no forecast payload. */
export function mercedesNoForecastServiceInfo(): ServiceInfoStatus {
  return {
    hasServiceHistory: true,
    hasServiceBaseline: true,
    maintenanceForecast: null,
    lastServiceDate: '2025-06-01',
    lastServiceOdometer: 42000,
    serviceOverdue: false,
    serviceDueImminently: false,
    tuvOverdue: false,
    bokraftOverdue: false,
  } as unknown as ServiceInfoStatus;
}
