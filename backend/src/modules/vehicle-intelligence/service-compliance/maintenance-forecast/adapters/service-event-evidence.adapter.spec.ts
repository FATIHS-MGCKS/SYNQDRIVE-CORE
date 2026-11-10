import { eventCoversPosition } from '../maintenance-coverage.util';
import type { MaintenanceSchedulePosition } from '../maintenance-forecast.types';
import { eventSourceFromOrigin, mapServiceEventsToEvidence } from './service-event-evidence.adapter';

const oilPosition: MaintenanceSchedulePosition = {
  positionId: 'oil',
  kind: 'OIL_CHANGE',
  label: 'Oil',
  intervalMode: 'RECURRING',
  intervalKm: 15_000,
  intervalMonths: 12,
  componentTerms: [],
  scheduleSource: 'ONEAUTO_SCHEDULE',
  rawIntervalDescription: null,
};

describe('eventSourceFromOrigin', () => {
  it('maps known origins explicitly without silent MANUAL fallback', () => {
    expect(eventSourceFromOrigin('MANUAL')).toBe('SERVICE_EVENT_MANUAL');
    expect(eventSourceFromOrigin('ONEAUTO')).toBe('SERVICE_EVENT_ONEAUTO');
    expect(eventSourceFromOrigin('AI_UPLOAD')).toBe('SERVICE_EVENT_OCR');
    expect(eventSourceFromOrigin('WORKSHOP_DOCUMENT')).toBe('SERVICE_EVENT_WORKSHOP');
    expect(eventSourceFromOrigin('IMPORT')).toBe('SERVICE_EVENT_IMPORT');
    expect(eventSourceFromOrigin('OEM')).toBe('SERVICE_EVENT_OEM');
    expect(eventSourceFromOrigin('LEGACY_UNKNOWN')).toBe('SERVICE_EVENT_UNSUPPORTED');
  });
});

describe('mapServiceEventsToEvidence — origin fail-closed', () => {
  it('IMPORT type-only OIL_CHANGE does not reset engine oil', () => {
    const [ev] = mapServiceEventsToEvidence([
      {
        id: 'imp-1',
        eventType: 'OIL_CHANGE',
        eventDate: new Date('2025-06-01T00:00:00Z'),
        odometerKm: 80_000,
        origin: 'IMPORT',
        sourcePayloadJson: null,
      },
    ]);
    expect(ev.eventSource).toBe('SERVICE_EVENT_IMPORT');
    expect(eventCoversPosition(ev, oilPosition)).toBe(false);
  });

  it('OEM type-only OIL_CHANGE does not reset engine oil', () => {
    const [ev] = mapServiceEventsToEvidence([
      {
        id: 'oem-1',
        eventType: 'OIL_CHANGE',
        eventDate: new Date('2025-06-01T00:00:00Z'),
        odometerKm: 80_000,
        origin: 'OEM',
        sourcePayloadJson: null,
      },
    ]);
    expect(ev.eventSource).toBe('SERVICE_EVENT_OEM');
    expect(eventCoversPosition(ev, oilPosition)).toBe(false);
  });

  it('explicit MANUAL OIL_CHANGE still resets engine oil when confirmed', () => {
    const [ev] = mapServiceEventsToEvidence([
      {
        id: 'man-1',
        eventType: 'OIL_CHANGE',
        eventDate: new Date('2025-06-01T00:00:00Z'),
        odometerKm: 80_000,
        origin: 'MANUAL',
        sourcePayloadJson: null,
      },
    ]);
    expect(eventCoversPosition(ev, oilPosition)).toBe(true);
  });

  it('future-dated events are excluded at engine layer but retain mapped source', () => {
    const [ev] = mapServiceEventsToEvidence([
      {
        id: 'fut',
        eventType: 'FULL_SERVICE',
        eventDate: new Date('2027-01-01T00:00:00Z'),
        odometerKm: 100_000,
        origin: 'MANUAL',
        sourcePayloadJson: { service_actions: ['Inspection large'] },
      },
    ]);
    expect(ev.eventSource).toBe('SERVICE_EVENT_MANUAL');
  });
});
