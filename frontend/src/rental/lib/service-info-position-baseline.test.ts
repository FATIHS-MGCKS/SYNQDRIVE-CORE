import { describe, expect, it } from 'vitest';
import { classifyPositionBaseline } from './service-info-position-baseline';

describe('classifyPositionBaseline', () => {
  it('uses backend DOCUMENTED evidenceClass for OneAuto', () => {
    const result = classifyPositionBaseline(
      {
        date: '2025-03-20',
        odometerKm: 170430,
        eventId: 'ev-oil',
        eventType: 'OIL_CHANGE',
        eventSource: 'SERVICE_EVENT_ONEAUTO',
        evidenceClass: 'DOCUMENTED',
      },
      [],
    );
    expect(result.evidenceClass).toBe('documented_service');
  });

  it('uses backend USER_DECLARED for manual entries', () => {
    const result = classifyPositionBaseline(
      {
        date: '2025-03-20',
        odometerKm: 170430,
        eventId: 'ev-man',
        eventType: 'OIL_CHANGE',
        eventSource: 'SERVICE_EVENT_MANUAL',
        evidenceClass: 'USER_DECLARED',
      },
      [],
    );
    expect(result.evidenceClass).toBe('user_declared');
  });

  it('treats vehicle master data as calculation basis only', () => {
    const result = classifyPositionBaseline(
      {
        date: '2022-03-22',
        odometerKm: 90000,
        eventId: null,
        eventType: null,
        eventSource: 'VEHICLE_MASTER_DATA',
        evidenceClass: 'CALCULATION_BASIS',
      },
      ['BASELINE_FROM_MASTER_DATA'],
    );
    expect(result.evidenceClass).toBe('calculation_basis');
  });

  it('marks IMPORT origin as unsupported when evidenceClass absent (legacy)', () => {
    const result = classifyPositionBaseline(
      {
        date: '2022-03-22',
        odometerKm: 90000,
        eventId: 'imp',
        eventType: 'OIL_CHANGE',
        eventSource: 'SERVICE_EVENT_IMPORT',
      },
      [],
    );
    expect(result.evidenceClass).toBe('unsupported');
  });
});
