import type { MaintenanceEvidenceEvent, MaintenanceSchedulePosition } from './maintenance-forecast.types';
import {
  eventCoversPosition,
  isEngineOilChangeWorkItem,
  isOilFilterInspectionWorkItem,
  isOilLevelCheckOnlyWorkItem,
} from './maintenance-coverage.util';

function oilPosition(): MaintenanceSchedulePosition {
  return {
    positionId: 'oneauto:oil',
    kind: 'OIL_CHANGE',
    label: 'Engine oil',
    intervalMode: 'RECURRING',
    intervalKm: 15_000,
    intervalMonths: 12,
    componentTerms: [],
    scheduleSource: 'ONEAUTO_SCHEDULE',
    rawIntervalDescription: null,
  };
}

function event(overrides: Partial<MaintenanceEvidenceEvent>): MaintenanceEvidenceEvent {
  return {
    eventId: 'e1',
    eventType: 'OIL_CHANGE',
    eventDate: new Date('2025-06-01T00:00:00.000Z'),
    odometerKm: 50_000,
    performedWork: [],
    serviceKind: null,
    eventSource: 'SERVICE_EVENT_MANUAL',
    ...overrides,
  };
}

describe('maintenance-coverage.util (oil classification)', () => {
  it('rejects transmission / axle / differential oil as engine oil', () => {
    expect(isEngineOilChangeWorkItem('Automatic Transmission Oil Replace')).toBe(false);
    expect(isEngineOilChangeWorkItem('Rear axle oil change')).toBe(false);
    expect(isEngineOilChangeWorkItem('Differential fluid service')).toBe(false);
    expect(isEngineOilChangeWorkItem('Haldex coupling oil')).toBe(false);
  });

  it('rejects pure oil level checks', () => {
    expect(isOilLevelCheckOnlyWorkItem('Oil level check')).toBe(true);
    expect(isOilLevelCheckOnlyWorkItem('Ölstand kontrollieren')).toBe(true);
    expect(isEngineOilChangeWorkItem('Oil level check')).toBe(false);
  });

  it('accepts documented engine oil change vocabulary', () => {
    expect(isEngineOilChangeWorkItem('Engine Oil Replace')).toBe(true);
    expect(isEngineOilChangeWorkItem('Motoröl und Filter wechseln')).toBe(true);
    expect(isEngineOilChangeWorkItem('Motoröl wechseln')).toBe(true);
  });

  it('rejects generic Oil Replace without motor-oil context', () => {
    expect(isEngineOilChangeWorkItem('Oil Replace')).toBe(false);
    const pos = oilPosition();
    expect(
      eventCoversPosition(
        event({ eventSource: 'SERVICE_EVENT_OCR', performedWork: ['Oil Replace'] }),
        pos,
      ),
    ).toBe(false);
  });

  it('rejects oil filter inspection and filter-only work without motor-oil proof', () => {
    expect(isOilFilterInspectionWorkItem('Oil filter check')).toBe(true);
    expect(isOilFilterInspectionWorkItem('Ölfilter Kontrolle')).toBe(true);
    expect(isEngineOilChangeWorkItem('Oil filter check')).toBe(false);
    expect(isEngineOilChangeWorkItem('Oil Filter Replace')).toBe(false);
    expect(isEngineOilChangeWorkItem('Ölfilter prüfen')).toBe(false);
  });

  it('does not reset OIL_CHANGE from OCR/workshop with only filter or level lines', () => {
    const pos = oilPosition();
    for (const source of ['SERVICE_EVENT_OCR', 'SERVICE_EVENT_WORKSHOP'] as const) {
      expect(
        eventCoversPosition(event({ eventSource: source, performedWork: ['Oil level check'] }), pos),
      ).toBe(false);
      expect(
        eventCoversPosition(event({ eventSource: source, performedWork: ['Oil filter inspection'] }), pos),
      ).toBe(false);
      expect(
        eventCoversPosition(
          event({ eventSource: source, performedWork: ['Engine Oil Replace'] }),
          pos,
        ),
      ).toBe(true);
    }
  });

  it('does not reset OIL_CHANGE from OneAuto without engine-oil proof', () => {
    const pos = oilPosition();
    expect(
      eventCoversPosition(
        event({
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          performedWork: ['Automatic Transmission Oil Replace'],
        }),
        pos,
      ),
    ).toBe(false);
    expect(
      eventCoversPosition(
        event({
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          performedWork: [],
        }),
        pos,
      ),
    ).toBe(false);
  });

  it('allows explicit manual OIL_CHANGE without work lines', () => {
    expect(eventCoversPosition(event({ eventSource: 'SERVICE_EVENT_MANUAL', performedWork: [] }), oilPosition())).toBe(
      true,
    );
  });

  it('does not infer INSPECTION_SMALL/LARGE without confirmed serviceKind', () => {
    const pos: MaintenanceSchedulePosition = {
      ...oilPosition(),
      kind: 'INSPECTION_LARGE',
      positionId: 'manual:large',
    };
    expect(
      eventCoversPosition(
        event({
          eventType: 'GENERAL_INSPECTION',
          serviceKind: null,
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          performedWork: ['Brake fluid check'],
        }),
        pos,
      ),
    ).toBe(false);
    expect(
      eventCoversPosition(
        event({
          eventType: 'GENERAL_INSPECTION',
          serviceKind: 'INSPECTION_LARGE',
          performedWork: [],
        }),
        pos,
      ),
    ).toBe(true);
  });

  it('rejects axle-only mentions and inspection-only component lines (M-1)', () => {
    const pos: MaintenanceSchedulePosition = {
      ...oilPosition(),
      kind: 'OTHER',
      positionId: 'oneauto:brake_awd',
      componentTerms: ['brake_fluid', 'axle_oil'],
    };
    expect(
      eventCoversPosition(
        event({ eventType: 'REPAIR', performedWork: ['Breakpads rear axle replaced.'] }),
        pos,
      ),
    ).toBe(false);
    expect(
      eventCoversPosition(
        event({ eventType: 'FULL_SERVICE', performedWork: ['Brake fluid level checked'] }),
        {
          ...pos,
          componentTerms: ['brake_fluid'],
        },
      ),
    ).toBe(false);
  });

  it('recognizes German past-tense engine oil service wording (M-4)', () => {
    expect(isEngineOilChangeWorkItem('Motoröl erneuert')).toBe(true);
    expect(isEngineOilChangeWorkItem('Engine oil and filter replaced')).toBe(true);
  });

  it('does not blanket-reset all INSPECTION tiers from unscoped FULL_SERVICE (M-3)', () => {
    const small: MaintenanceSchedulePosition = {
      ...oilPosition(),
      kind: 'INSPECTION',
      positionId: 'oneauto:15k',
      intervalKm: 15_000,
    };
    const large: MaintenanceSchedulePosition = {
      ...small,
      positionId: 'oneauto:60k',
      intervalKm: 60_000,
    };
    const unscoped = event({
      eventType: 'FULL_SERVICE',
      eventSource: 'SERVICE_EVENT_ONEAUTO',
      odometerKm: 15_000,
      performedWork: [],
    });
    expect(eventCoversPosition(unscoped, small)).toBe(false);
    expect(eventCoversPosition(unscoped, large)).toBe(false);
    const smallServiceAt70k = {
      ...unscoped,
      serviceKind: 'INSPECTION_SMALL' as const,
      odometerKm: 70_000,
    };
    expect(eventCoversPosition(smallServiceAt70k, large)).toBe(false);
    expect(
      eventCoversPosition(smallServiceAt70k, { ...small, kind: 'INSPECTION_SMALL' }),
    ).toBe(true);
  });

  it('rejects brake-fluid checks and weak service phrases for OTHER positions (F2)', () => {
    const pos: MaintenanceSchedulePosition = {
      ...oilPosition(),
      kind: 'OTHER',
      positionId: 'oneauto:brake_fluid',
      componentTerms: ['brake_fluid'],
    };
    const ev = (work: string) =>
      event({ eventType: 'FULL_SERVICE', eventSource: 'SERVICE_EVENT_ONEAUTO', performedWork: [work] });
    expect(eventCoversPosition(ev('Brake fluid service check'), pos)).toBe(false);
    expect(eventCoversPosition(ev('service interval brake fluid'), pos)).toBe(false);
    expect(eventCoversPosition(ev('Brake fluid check'), pos)).toBe(false);
    expect(eventCoversPosition(ev('Brake fluid replaced'), pos)).toBe(true);
    expect(eventCoversPosition(ev('Bremsflüssigkeit gewechselt'), pos)).toBe(true);
  });

  it('covers engine oil when OneAuto lists engine oil actions', () => {
    expect(
      eventCoversPosition(
        event({
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          performedWork: ['Engine Oil Replace', 'Oil Filter Replace'],
        }),
        oilPosition(),
      ),
    ).toBe(true);
    expect(
      eventCoversPosition(
        event({
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          performedWork: ['Oil Filter Replace'],
        }),
        oilPosition(),
      ),
    ).toBe(false);
  });
});
