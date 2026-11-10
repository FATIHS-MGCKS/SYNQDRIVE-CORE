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

export const MERCEDES_HISTORY_FIXTURE: ServiceInfoStatus['serviceHistory'] = [
  {
    id: 'mh-2025-full',
    eventType: 'FULL_SERVICE',
    date: '2025-06-15T10:00:00.000Z',
    odometerKm: 42000,
    workshopName: 'Mercedes-Benz Service Berlin',
    notes: 'Service A mit Ölwechsel',
    origin: 'ONEAUTO',
    provider: 'OneAuto',
    providerServiceType: 'Service A',
    performedActions: ['Oil filter', 'Inspection'],
    externalSource: true,
  },
  {
    id: 'mh-2025-same-day',
    eventType: 'REPAIR',
    date: '2025-06-15T14:30:00.000Z',
    odometerKm: 42010,
    workshopName: 'Mercedes-Benz Service Berlin',
    notes: null,
    origin: 'MANUAL',
    provider: null,
    providerServiceType: null,
    performedActions: ['Wheel alignment check'],
    externalSource: false,
  },
  {
    id: 'mh-2024-inspection',
    eventType: 'GENERAL_INSPECTION',
    date: '2024-03-02T09:00:00.000Z',
    odometerKm: 28500,
    workshopName: 'Stern Partner Hamburg',
    notes: 'HU/AU',
    origin: 'WORKSHOP_DOCUMENT',
    provider: 'Workshop OCR',
    providerServiceType: 'General inspection',
    performedActions: ['Brake check'],
    externalSource: false,
  },
  {
    id: 'mh-2023-oil',
    eventType: 'OIL_CHANGE',
    date: '2023-11-08T11:00:00.000Z',
    odometerKm: 19800,
    workshopName: null,
    notes: null,
    origin: 'AI_UPLOAD',
    provider: null,
    providerServiceType: null,
    performedActions: [],
    externalSource: false,
  },
  {
    id: 'mh-2022-minimal',
    eventType: 'OTHER',
    date: 'invalid-iso',
    odometerKm: null,
    workshopName: null,
    notes: null,
    origin: undefined,
    provider: null,
    providerServiceType: null,
    performedActions: undefined,
    externalSource: false,
  },
];

/** Mercedes-like: history-rich, no forecast payload (pagination fixture). */
export function mercedesNoForecastServiceInfo(): ServiceInfoStatus {
  const initial = MERCEDES_HISTORY_FIXTURE.slice(0, 3);
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
    serviceHistory: initial,
    serviceHistoryTotalCount: MERCEDES_HISTORY_FIXTURE.length,
    serviceHistoryHasMore: true,
    serviceHistoryNextCursor: 'fixture-cursor-2',
  } as unknown as ServiceInfoStatus;
}

export function mercedesHistoryPage2(): ServiceInfoStatus['serviceHistory'] {
  return MERCEDES_HISTORY_FIXTURE.slice(1);
}

/** Arteon-like with mixed plan + short history. */
/** Arteon modal QA: overdue advisory plus blocking TÜV for compliance presentation. */
export function arteonFixtureModalPresentation(): ServiceInfoStatus {
  const base = arteonFixtureWithHistory();
  return {
    ...base,
    tuvValidTill: '2025-08-01T00:00:00.000Z',
    tuvRemainingDays: -12,
    tuvOverdue: true,
    bokraftValidTill: '2027-04-15T00:00:00.000Z',
    bokraftRemainingDays: 120,
    bokraftOverdue: false,
  } as unknown as ServiceInfoStatus;
}

/** iPhone production-like overdue clarity fixture (UX-3.2). */
export function iphoneUx32OverdueFixture(): ServiceInfoStatus {
  const notComputable: MaintenancePositionForecast[] = Array.from({ length: 11 }, (_, i) =>
    position({
      positionId: `p-nc-${i}`,
      kind: 'OTHER',
      label: `Nicht berechenbar ${i + 1}`,
      dueState: 'NO_BASELINE',
      baseline: null,
      remainingKm: null,
      remainingDays: null,
      provenance: {
        scheduleSource: 'ONEAUTO_SCHEDULE',
        eventSource: 'NONE',
        odometerSource: 'VEHICLE_LATEST_STATE',
        calculationMethod: 'NOT_COMPUTABLE',
      },
    }),
  );

  const positions: MaintenancePositionForecast[] = [
    position({
      positionId: 'p-brake-fluid',
      kind: 'OTHER',
      label: 'Bremsflüssigkeit',
      dueState: 'OVERDUE',
      remainingDays: -963,
      remainingKm: null,
      intervalMonths: 24,
      baseline: {
        date: '2023-05-01',
        odometerKm: 120000,
        eventId: 'bf-1',
        eventType: 'BRAKE_SERVICE',
        eventSource: 'SERVICE_EVENT_ONEAUTO',
      },
    }),
    position({
      positionId: 'p-oil',
      kind: 'OIL_CHANGE',
      label: 'Ölwechsel',
      dueState: 'OVERDUE',
      remainingDays: -235,
      remainingKm: -1546,
      intervalKm: 16093,
      intervalMonths: 12,
      dueAtDate: '2026-03-20',
      dueAtKm: 186523,
      baseline: {
        date: '2025-03-20',
        odometerKm: 170430,
        eventId: 'oil-1',
        eventType: 'OIL_CHANGE',
        eventSource: 'SERVICE_EVENT_ONEAUTO',
      },
    }),
    position({
      positionId: 'p-spark',
      kind: 'OTHER',
      label: 'Zündkerzen',
      dueState: 'OVERDUE',
      remainingDays: -158,
      remainingKm: null,
      baseline: {
        date: '2024-09-10',
        odometerKm: 155000,
        eventId: 'sp-1',
        eventType: 'OTHER',
        eventSource: 'SERVICE_EVENT_MANUAL',
      },
    }),
    position({
      positionId: 'p-md-only',
      kind: 'OTHER',
      label: 'Luftfilter (Stammdaten)',
      dueState: 'DUE_SOON',
      remainingDays: 12,
      baseline: {
        date: '2022-03-22',
        odometerKm: null,
        eventId: null,
        eventType: null,
        eventSource: 'VEHICLE_MASTER_DATA',
      },
      dataQuality: ['BASELINE_FROM_MASTER_DATA'],
    }),
    position({
      positionId: 'p-date-only',
      kind: 'OTHER',
      label: 'Klimaanlage (nur Datum)',
      dueState: 'OK',
      remainingDays: 90,
      baseline: {
        date: '2024-01-15',
        odometerKm: null,
        eventId: 'date-1',
        eventType: 'OTHER',
        eventSource: 'SERVICE_EVENT_WORKSHOP',
      },
      dataQuality: ['BASELINE_ODOMETER_MISSING'],
    }),
    ...notComputable,
  ];

  return {
    hasServiceHistory: true,
    maintenanceForecast: baseForecast({
      scheduleSources: ['ONEAUTO_SCHEDULE'],
      positions,
      nextDue: positions[0],
    }),
    nextService: {
      trackingStatus: 'TRACKED',
      source: 'COMPUTED_ONEAUTO_SCHEDULE',
      positionId: 'p-brake-fluid',
      remainingDays: -963,
      overdue: true,
    },
    serviceOverdue: true,
  } as unknown as ServiceInfoStatus;
}

export function arteonFixtureWithHistory(): ServiceInfoStatus {
  const base = arteonFixtureServiceInfo();
  return {
    ...base,
    serviceHistory: [
      {
        id: 'art-2026',
        eventType: 'OIL_CHANGE',
        date: '2026-01-10T08:00:00.000Z',
        odometerKm: 47000,
        workshopName: 'VW Zentrum',
        notes: 'Nach OneAuto-Plan',
        origin: 'ONEAUTO',
        provider: 'OneAuto',
        providerServiceType: 'Oil service',
        performedActions: ['Engine oil'],
        externalSource: true,
      },
      {
        id: 'art-2025',
        eventType: 'FULL_SERVICE',
        date: '2025-08-01T12:00:00.000Z',
        odometerKm: 41000,
        workshopName: 'Independent Garage',
        notes: null,
        origin: 'MANUAL',
        provider: null,
        providerServiceType: null,
        performedActions: ['Filter set'],
        externalSource: false,
      },
    ],
    serviceHistoryHasMore: false,
    serviceHistoryNextCursor: null,
    serviceHistoryTotalCount: 2,
  } as ServiceInfoStatus;
}
