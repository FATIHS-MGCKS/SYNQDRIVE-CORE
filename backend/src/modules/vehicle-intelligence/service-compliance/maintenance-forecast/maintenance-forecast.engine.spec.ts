import { addCalendarMonths, diffCalendarMonths, diffDays } from './calendar-math.util';
import { eventCoversPosition } from './maintenance-coverage.util';
import { computeMaintenanceForecast } from './maintenance-forecast.engine';
import type {
  MaintenanceEvidenceEvent,
  MaintenanceForecastInput,
  MaintenanceSchedulePosition,
} from './maintenance-forecast.types';

const NOW = new Date('2026-11-08T12:00:00.000Z');

const THRESHOLDS: MaintenanceForecastInput['thresholds'] = {
  warningKm: 1500,
  warningDays: 30,
  odometerStaleDays: 14,
  conflictKmTolerance: 1000,
  conflictDaysTolerance: 30,
};

function inspection(overrides: Partial<MaintenanceSchedulePosition> = {}): MaintenanceSchedulePosition {
  return {
    positionId: 'manual:inspection',
    kind: 'INSPECTION',
    label: 'INSPECTION',
    intervalMode: 'RECURRING',
    intervalKm: 20_000,
    intervalMonths: 12,
    componentTerms: [],
    scheduleSource: 'MANUAL_INTERVAL',
    rawIntervalDescription: null,
    ...overrides,
  };
}

function oilChange(overrides: Partial<MaintenanceSchedulePosition> = {}): MaintenanceSchedulePosition {
  return {
    positionId: 'oneauto:SID1001',
    kind: 'OIL_CHANGE',
    label: 'Oil service',
    intervalMode: 'RECURRING',
    intervalKm: 15_000,
    intervalMonths: 12,
    componentTerms: [],
    scheduleSource: 'ONEAUTO_SCHEDULE',
    rawIntervalDescription: 'every 15000 km or 12 months',
    ...overrides,
  };
}

function event(overrides: Partial<MaintenanceEvidenceEvent> = {}): MaintenanceEvidenceEvent {
  return {
    eventId: 'evt-1',
    eventType: 'FULL_SERVICE',
    eventDate: new Date('2025-12-08T10:00:00.000Z'),
    odometerKm: 80_000,
    performedWork: [],
    serviceKind: null,
    eventSource: 'SERVICE_EVENT_MANUAL',
    ...overrides,
  };
}

function input(overrides: Partial<MaintenanceForecastInput>): MaintenanceForecastInput {
  return {
    now: NOW,
    positions: [],
    events: [],
    masterDataBaselines: null,
    odometer: { km: 99_000, observedAt: new Date('2026-11-07T08:00:00.000Z'), source: 'VEHICLE_LATEST_STATE' },
    hm: null,
    thresholds: THRESHOLDS,
    ...overrides,
  };
}

describe('calendar-math.util', () => {
  it('adds calendar months with end-of-month clamping', () => {
    expect(addCalendarMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addCalendarMonths(new Date('2024-01-31T00:00:00Z'), 1).toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(addCalendarMonths(new Date('2025-11-15T00:00:00Z'), 12).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(addCalendarMonths(new Date('2025-11-15T00:00:00Z'), -13).toISOString()).toBe('2024-10-15T00:00:00.000Z');
  });

  it('computes whole calendar months (not 30-day blocks)', () => {
    expect(diffCalendarMonths(new Date('2026-01-15T00:00:00Z'), new Date('2026-02-14T00:00:00Z'))).toBe(0);
    expect(diffCalendarMonths(new Date('2026-01-15T00:00:00Z'), new Date('2026-02-15T00:00:00Z'))).toBe(1);
    expect(diffCalendarMonths(new Date('2026-01-15T00:00:00Z'), new Date('2025-12-10T00:00:00Z'))).toBe(-1);
    // 31 + 28 + 31 = 90 days → 3 calendar months, not 90/30 = 3 by accident; Feb-May spans 89 days but is 3 months
    expect(diffCalendarMonths(new Date('2026-02-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'))).toBe(3);
    expect(diffDays(new Date('2026-02-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'))).toBe(89);
  });
});

describe('computeMaintenanceForecast — acceptance scenarios', () => {
  it('80,000 → 100,000 km interval at 99,000 km and 11 of 12 months → ~1,000 km / ~1 month', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection({ intervalKm: 20_000, intervalMonths: 12 })],
        events: [event({ eventDate: new Date('2025-12-08T10:00:00.000Z'), odometerKm: 80_000 })],
      }),
    );
    const pos = result.positions[0]!;
    expect(pos.dueAtKm).toBe(100_000);
    expect(pos.remainingKm).toBe(1_000);
    expect(pos.dueAtDate).toBe('2026-12-08T10:00:00.000Z');
    expect(pos.remainingMonths).toBe(1);
    expect(pos.remainingDays).toBe(30);
    expect(pos.dueState).toBe('DUE_SOON');
    expect(pos.computationMode).toBe('KM_AND_TIME');
    expect(pos.provenance).toEqual({
      scheduleSource: 'MANUAL_INTERVAL',
      eventSource: 'SERVICE_EVENT_MANUAL',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    });
    expect(result.nextDue?.positionId).toBe('manual:inspection');
  });

  it('km exceeded → OVERDUE even when time is fine', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event({ eventDate: new Date('2026-08-01T00:00:00Z'), odometerKm: 70_000 })],
        odometer: { km: 95_000, observedAt: NOW, source: 'VEHICLE_LATEST_STATE' },
      }),
    );
    const pos = result.positions[0]!;
    expect(pos.remainingKm).toBe(-5_000);
    expect(pos.remainingDays).toBeGreaterThan(200);
    expect(pos.dueState).toBe('OVERDUE');
    expect(pos.severity).toBe('CRITICAL');
  });

  it('time exceeded → OVERDUE even when km is fine', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event({ eventDate: new Date('2025-06-01T00:00:00Z'), odometerKm: 95_000 })],
        odometer: { km: 99_000, observedAt: NOW, source: 'VEHICLE_LATEST_STATE' },
      }),
    );
    const pos = result.positions[0]!;
    expect(pos.remainingKm).toBe(16_000);
    expect(pos.remainingDays).toBeLessThan(0);
    expect(pos.remainingMonths).toBe(-5);
    expect(pos.dueState).toBe('OVERDUE');
  });

  it('oil change without full inspection leaves the inspection due unchanged', () => {
    const base = input({
      positions: [inspection(), oilChange()],
      events: [event({ eventId: 'insp', eventDate: new Date('2025-01-10T00:00:00Z'), odometerKm: 60_000 })],
    });
    const before = computeMaintenanceForecast(base);
    const after = computeMaintenanceForecast({
      ...base,
      events: [
        ...base.events,
        event({
          eventId: 'oil',
          eventType: 'OIL_CHANGE',
          eventDate: new Date('2026-10-01T00:00:00Z'),
          odometerKm: 98_000,
        }),
      ],
    });
    const inspBefore = before.positions.find((p) => p.kind === 'INSPECTION')!;
    const inspAfter = after.positions.find((p) => p.kind === 'INSPECTION')!;
    expect(inspAfter.dueAtKm).toBe(inspBefore.dueAtKm);
    expect(inspAfter.dueAtDate).toBe(inspBefore.dueAtDate);
    expect(inspAfter.dueState).toBe('OVERDUE');

    const oilAfter = after.positions.find((p) => p.kind === 'OIL_CHANGE')!;
    expect(oilAfter.baseline?.eventId).toBe('oil');
    expect(oilAfter.dueAtKm).toBe(113_000);
    expect(oilAfter.dueState).toBe('OK');
  });

  it('full proven service updates only covered positions (oil only when work item proves it)', () => {
    const brakeFluid: MaintenanceSchedulePosition = {
      positionId: 'oneauto:SID1010',
      kind: 'OTHER',
      label: 'Brake Fluid',
      intervalMode: 'RECURRING',
      intervalKm: null,
      intervalMonths: 36,
      componentTerms: ['brake_fluid'],
      scheduleSource: 'ONEAUTO_SCHEDULE',
      rawIntervalDescription: 'every 36 months,regardless of mileage',
    };
    const sparkPlug: MaintenanceSchedulePosition = {
      ...brakeFluid,
      positionId: 'oneauto:SID1012',
      label: 'Spark Plug',
      intervalKm: 60_000,
      intervalMonths: 48,
      componentTerms: ['spark_plug'],
    };
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection(), oilChange(), brakeFluid, sparkPlug],
        events: [
          event({
            eventId: 'full',
            eventType: 'FULL_SERVICE',
            eventDate: new Date('2026-09-01T00:00:00Z'),
            odometerKm: 97_000,
            performedWork: ['Engine: oil and filter change.', 'Brake fluid replaced.'],
          }),
        ],
      }),
    );
    const byId = Object.fromEntries(result.positions.map((p) => [p.positionId, p]));
    expect(byId['manual:inspection']!.baseline?.eventId).toBe('full');
    expect(byId['oneauto:SID1001']!.baseline?.eventId).toBe('full');
    expect(byId['oneauto:SID1010']!.baseline?.eventId).toBe('full');
    expect(byId['oneauto:SID1012']!.baseline).toBeNull();
    expect(byId['oneauto:SID1012']!.dueState).toBe('NO_BASELINE');
  });

  it('full service WITHOUT oil work item does not reset the oil position', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [oilChange()],
        events: [event({ eventType: 'FULL_SERVICE', performedWork: ['Brake pads replaced'] })],
      }),
    );
    expect(result.positions[0]!.dueState).toBe('NO_BASELINE');
  });

  it('repair / OTHER / brake events never reset regular positions', () => {
    for (const type of ['REPAIR', 'OTHER', 'BRAKE_SERVICE', 'TIRE_ROTATION', 'BATTERY_REPLACEMENT', 'TUV_INSPECTION']) {
      const result = computeMaintenanceForecast(
        input({
          positions: [inspection(), oilChange()],
          events: [event({ eventType: type, performedWork: ['Engine: oil and filter change.'] })],
        }),
      );
      for (const p of result.positions) {
        expect(p.dueState).toBe('NO_BASELINE');
      }
    }
  });

  it('history without schedule → no invented plan, but last maintenance surfaced', () => {
    const result = computeMaintenanceForecast(input({ positions: [], events: [event()] }));
    expect(result.positions).toHaveLength(0);
    expect(result.nextDue).toBeNull();
    expect(result.dataQuality).toContain('SCHEDULE_MISSING');
    expect(result.lastRelevantMaintenance?.eventId).toBe('evt-1');
    expect(result.lastRelevantMaintenance?.evidenceClass).toBe('USER_DECLARED');
  });

  it('lastRelevantMaintenance prefers newer oil baseline over older inspection baseline', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection(), oilChange()],
        events: [
          event({
            eventId: 'insp-ev',
            eventDate: new Date('2024-06-01T00:00:00Z'),
            odometerKm: 50_000,
          }),
          event({
            eventId: 'oil-ev',
            eventType: 'OIL_CHANGE',
            eventDate: new Date('2025-08-01T00:00:00Z'),
            odometerKm: 72_000,
            performedWork: ['Engine oil and filter replaced'],
          }),
        ],
      }),
    );
    expect(result.lastRelevantMaintenance?.eventId).toBe('oil-ev');
  });

  it('lastRelevantMaintenance excludes future-dated and unsupported import claims', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [],
        events: [
          event({
            eventId: 'future',
            eventDate: new Date('2027-01-01T00:00:00Z'),
          }),
          event({
            eventId: 'import-oil',
            eventType: 'OIL_CHANGE',
            eventSource: 'SERVICE_EVENT_IMPORT',
            eventDate: new Date('2025-06-01T00:00:00Z'),
          }),
        ],
      }),
    );
    expect(result.lastRelevantMaintenance).toBeNull();
  });

  it('position baseline carries evidenceClass DOCUMENTED vs USER_DECLARED', () => {
    const documented = computeMaintenanceForecast(
      input({
        positions: [oilChange()],
        events: [
          event({
            eventId: 'oa',
            eventType: 'OIL_CHANGE',
            eventSource: 'SERVICE_EVENT_ONEAUTO',
            performedWork: ['Engine oil and filter replaced'],
          }),
        ],
      }),
    );
    expect(documented.positions[0]!.baseline?.evidenceClass).toBe('DOCUMENTED');

    const manual = computeMaintenanceForecast(
      input({
        positions: [oilChange()],
        events: [event({ eventId: 'man', eventType: 'OIL_CHANGE' })],
      }),
    );
    expect(manual.positions[0]!.baseline?.evidenceClass).toBe('USER_DECLARED');
  });

  it('does not emit HISTORY_MISSING when evidence load failed with empty events', () => {
    const result = computeMaintenanceForecast(
      input({ positions: [inspection()], events: [], evidenceLoadFlags: ['HISTORY_EVIDENCE_LOAD_FAILED'] }),
    );
    expect(result.dataQuality).toContain('HISTORY_EVIDENCE_LOAD_FAILED');
    expect(result.dataQuality).not.toContain('HISTORY_MISSING');
  });

  it('lastRelevantMaintenance ignores master-data-only position baselines', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [],
        masterDataBaselines: {
          inspection: { date: new Date('2020-01-01T00:00:00Z'), odometerKm: 10_000 },
          oilChange: { date: null, odometerKm: null },
        },
      }),
    );
    const pos = result.positions[0]!;
    expect(pos.baseline?.eventSource).toBe('VEHICLE_MASTER_DATA');
    expect(result.lastRelevantMaintenance).toBeNull();
  });

  it('schedule without history → no invented last service', () => {
    const result = computeMaintenanceForecast(input({ positions: [inspection()], events: [] }));
    const pos = result.positions[0]!;
    expect(pos.baseline).toBeNull();
    expect(pos.dueState).toBe('NO_BASELINE');
    expect(pos.dueAtKm).toBeNull();
    expect(result.nextDue).toBeNull();
    expect(result.dataQuality).toContain('HISTORY_MISSING');
    expect(result.lastRelevantMaintenance).toBeNull();
  });

  it('without odometer → time-only computation and ODOMETER_MISSING flag', () => {
    const result = computeMaintenanceForecast(
      input({ positions: [inspection()], events: [event()], odometer: null }),
    );
    const pos = result.positions[0]!;
    expect(pos.computationMode).toBe('TIME_ONLY');
    expect(pos.remainingKm).toBeNull();
    expect(pos.remainingDays).toBe(30);
    expect(pos.dueState).toBe('DUE_SOON');
    expect(pos.dataQuality).toContain('ODOMETER_MISSING');
    expect(result.dataQuality).toContain('ODOMETER_MISSING');
  });

  it('time-only plan position ("every 24 months, regardless of mileage") is computed without km', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [oilChange({ intervalKm: null, intervalMonths: 24, rawIntervalDescription: 'every 24 months,regardless of mileage' })],
        events: [event({ eventType: 'OIL_CHANGE', eventDate: new Date('2025-01-15T00:00:00Z') })],
      }),
    );
    const pos = result.positions[0]!;
    expect(pos.computationMode).toBe('TIME_ONLY');
    expect(pos.dueAtDate).toBe('2027-01-15T00:00:00.000Z');
    expect(pos.dueState).toBe('OK');
    expect(pos.provenance.odometerSource).toBe('NONE');
  });

  it('stale odometer → limitation flagged, still computed', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event()],
        odometer: { km: 99_000, observedAt: new Date('2026-10-01T00:00:00Z'), source: 'VEHICLE_LATEST_STATE' },
      }),
    );
    expect(result.positions[0]!.remainingKm).toBe(1_000);
    expect(result.positions[0]!.dataQuality).toContain('ODOMETER_STALE');
    expect(result.dataQuality).toContain('ODOMETER_STALE');
  });

  it('odometer without timestamp (master data) → ODOMETER_TIMESTAMP_UNKNOWN', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event()],
        odometer: { km: 99_000, observedAt: null, source: 'VEHICLE_MASTER_DATA' },
      }),
    );
    expect(result.positions[0]!.dataQuality).toContain('ODOMETER_TIMESTAMP_UNKNOWN');
    expect(result.positions[0]!.provenance.odometerSource).toBe('VEHICLE_MASTER_DATA');
  });

  it('baseline event without odometer → km axis unavailable, flagged', () => {
    const result = computeMaintenanceForecast(
      input({ positions: [inspection()], events: [event({ odometerKm: null })] }),
    );
    const pos = result.positions[0]!;
    expect(pos.computationMode).toBe('TIME_ONLY');
    expect(pos.dataQuality).toContain('BASELINE_ODOMETER_MISSING');
  });

  it('conflicting HM vs computed values → conflict visible, values never merged', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event()],
        hm: { distanceToNextServiceKm: 8_000, timeToNextServiceDays: 120, lastUpdatedAt: NOW.toISOString(), fresh: true },
      }),
    );
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      code: 'CONFLICT_HM_VS_COMPUTED',
      hmRemainingKm: 8_000,
      computedRemainingKm: 1_000,
      hmRemainingDays: 120,
      computedRemainingDays: 30,
    });
    expect(result.dataQuality).toContain('CONFLICT_HM_VS_COMPUTED');
    expect(result.nextDue?.remainingKm).toBe(1_000);
    expect(result.hmOem?.distanceToNextServiceKm).toBe(8_000);
  });

  it('HM within tolerance → no conflict; stale HM never compared', () => {
    const ok = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event()],
        hm: { distanceToNextServiceKm: 1_400, timeToNextServiceDays: 35, lastUpdatedAt: NOW.toISOString(), fresh: true },
      }),
    );
    expect(ok.conflicts).toHaveLength(0);
    const stale = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event()],
        hm: { distanceToNextServiceKm: 20_000, timeToNextServiceDays: 300, lastUpdatedAt: null, fresh: false },
      }),
    );
    expect(stale.conflicts).toHaveLength(0);
    expect(stale.scheduleSources).not.toContain('HM_OEM');
  });

  it('master data fallback baseline is used only when no qualifying event exists', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event({ eventType: 'OIL_CHANGE', eventDate: new Date('2026-10-01T00:00:00Z'), odometerKm: 98_000 })],
        masterDataBaselines: {
          inspection: { date: new Date('2025-11-20T00:00:00Z'), odometerKm: 81_000 },
          oilChange: { date: null, odometerKm: null },
        },
      }),
    );
    const pos = result.positions[0]!;
    expect(pos.baseline?.eventSource).toBe('VEHICLE_MASTER_DATA');
    expect(pos.dueAtKm).toBe(101_000);
    expect(pos.dataQuality).toContain('BASELINE_FROM_MASTER_DATA');
  });

  it('odometer below baseline → conflict flagged', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [inspection()],
        events: [event({ odometerKm: 120_000 })],
      }),
    );
    expect(result.positions[0]!.dataQuality).toContain('ODOMETER_BELOW_BASELINE');
    expect(result.conflicts.some((c) => c.code === 'ODOMETER_BELOW_BASELINE')).toBe(true);
  });

  it('orders OVERDUE before DUE_SOON before OK deterministically', () => {
    const result = computeMaintenanceForecast(
      input({
        positions: [
          inspection({ positionId: 'a', intervalKm: 50_000, intervalMonths: 60 }),
          inspection({ positionId: 'b', intervalKm: 10_000, intervalMonths: 60 }),
          inspection({ positionId: 'c', intervalKm: 20_000, intervalMonths: 60 }),
        ],
        events: [event({ odometerKm: 80_000 })],
      }),
    );
    expect(result.positions.map((p) => p.positionId)).toEqual(['b', 'c', 'a']);
    expect(result.nextDue?.positionId).toBe('b');
  });

  it('is deterministic for identical input', () => {
    const i = input({ positions: [inspection(), oilChange()], events: [event()] });
    expect(computeMaintenanceForecast(i)).toEqual(computeMaintenanceForecast(i));
  });
});

describe('eventCoversPosition — small vs large inspection', () => {
  const large = inspection({ kind: 'INSPECTION_LARGE', positionId: 'large' });
  const small = inspection({ kind: 'INSPECTION_SMALL', positionId: 'small' });

  it('small service never marks the large service as done', () => {
    const smallEvent = event({ serviceKind: 'INSPECTION_SMALL' });
    expect(eventCoversPosition(smallEvent, large)).toBe(false);
    expect(eventCoversPosition(smallEvent, small)).toBe(true);
  });

  it('large service covers both', () => {
    const largeEvent = event({ serviceKind: 'INSPECTION_LARGE' });
    expect(eventCoversPosition(largeEvent, large)).toBe(true);
    expect(eventCoversPosition(largeEvent, small)).toBe(true);
  });

  it('unclassified manual full service covers generic INSPECTION only (not tier kinds)', () => {
    const genericManual = event({ serviceKind: null, eventSource: 'SERVICE_EVENT_MANUAL' });
    expect(eventCoversPosition(genericManual, inspection())).toBe(true);
    expect(eventCoversPosition(genericManual, large)).toBe(false);
    expect(eventCoversPosition(genericManual, small)).toBe(false);
    const genericOneAuto = event({ serviceKind: null, eventSource: 'SERVICE_EVENT_ONEAUTO' });
    expect(eventCoversPosition(genericOneAuto, inspection())).toBe(false);
  });
});
