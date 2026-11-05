import {
  mapOneAutoOeServiceHistoryEuEvent,
  parseOeServiceHistoryEuEventDate,
} from './oneauto-oe-service-history-eu-event.mapper';

describe('OneAuto OE service history event mapper validation', () => {
  it('rejects invalid calendar dates without rollover', () => {
    expect(parseOeServiceHistoryEuEventDate('2024-02-30')).toBeNull();
    expect(parseOeServiceHistoryEuEventDate('not-a-date')).toBeNull();
  });

  it('accepts valid YYYY-MM-DD', () => {
    const d = parseOeServiceHistoryEuEventDate('2024-04-22');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2024);
    expect(d!.getUTCMonth()).toBe(3);
    expect(d!.getUTCDate()).toBe(22);
  });

  it('skips malformed events in mapOneAutoOeServiceHistoryEuEvent', () => {
    const mapped = mapOneAutoOeServiceHistoryEuEvent({
      date_of_service_event: '2024-02-30',
      mileage_observed: 100,
      mileage_unit: 'km',
      service_provider: 'X',
      service_type: 'Maintenance',
      service_actions: ['Oil'],
    });
    expect(mapped.ok).toBe(false);
  });

  it('rejects negative odometer', () => {
    const mapped = mapOneAutoOeServiceHistoryEuEvent({
      date_of_service_event: '2024-04-22',
      mileage_observed: -1,
      mileage_unit: 'km',
      service_provider: 'X',
      service_type: 'Maintenance',
      service_actions: ['Oil'],
    });
    expect(mapped.ok).toBe(false);
  });
});
