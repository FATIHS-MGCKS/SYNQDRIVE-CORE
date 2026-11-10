import { describe, expect, it } from 'vitest';
import { classifyPositionBaseline } from './service-info-position-baseline';

describe('classifyPositionBaseline', () => {
  it('treats verified OneAuto events with id as proven service', () => {
    const result = classifyPositionBaseline(
      {
        date: '2025-03-20',
        odometerKm: 170430,
        eventId: 'ev-oil',
        eventType: 'OIL_CHANGE',
        eventSource: 'SERVICE_EVENT_ONEAUTO',
      },
      [],
    );
    expect(result.evidenceClass).toBe('verified_service');
  });

  it('treats vehicle master data as calculation basis only', () => {
    const result = classifyPositionBaseline(
      {
        date: '2022-03-22',
        odometerKm: 90000,
        eventId: null,
        eventType: null,
        eventSource: 'VEHICLE_MASTER_DATA',
      },
      ['BASELINE_FROM_MASTER_DATA'],
    );
    expect(result.evidenceClass).toBe('calculation_basis');
  });

  it('does not treat schedule-only NONE as verified', () => {
    const result = classifyPositionBaseline(
      {
        date: null,
        odometerKm: null,
        eventId: null,
        eventType: null,
        eventSource: 'NONE',
      },
      [],
    );
    expect(result.evidenceClass).toBe('missing');
  });
});
