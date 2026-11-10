import { describe, expect, it } from 'vitest';
import type { MaintenancePositionForecast } from '../../lib/api';
import { formatPositionDueLines } from './service-info-position-due-lines';

const t = (key: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    'health.serviceInfo.v3.ux32.plan.dueSinceLabel': 'Fällig seit:',
    'health.serviceInfo.v3.ux32.plan.dueOnLabel': 'Fällig am:',
    'health.serviceInfo.v3.ux32.plan.dueAtKmLabel': 'Fällig bei:',
    'health.serviceInfo.v3.ux32.plan.dueSinceKmLabel': 'Fällig seit:',
    'health.serviceInfo.v2.value.km': '{km} km',
  };
  const raw = map[key] ?? key;
  return Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), raw);
};

function pos(partial: Partial<MaintenancePositionForecast>): MaintenancePositionForecast {
  return {
    positionId: 'p-test',
    kind: 'OIL_CHANGE',
    label: 'Test',
    intervalMode: 'RECURRING',
    intervalKm: null,
    intervalMonths: null,
    rawIntervalDescription: null,
    baseline: null,
    dueAtKm: null,
    dueAtDate: null,
    remainingKm: null,
    remainingDays: null,
    remainingMonths: null,
    dueState: 'OK',
    computationMode: 'KM_AND_TIME',
    severity: 'INFO',
    provenance: {
      scheduleSource: 'ONEAUTO_SCHEDULE',
      eventSource: 'NONE',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    },
    dataQuality: [],
    ...partial,
  };
}

describe('formatPositionDueLines', () => {
  it('time overdue, km not reached — Fällig seit date + Fällig bei km', () => {
    const lines = formatPositionDueLines(
      pos({
        dueAtDate: '2026-03-20',
        dueAtKm: 186523,
        remainingDays: -235,
        remainingKm: 500,
        dueState: 'OVERDUE',
      }),
      t,
      'de-DE',
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Fällig seit:/);
    expect(lines[0]).toContain('20.03.2026');
    expect(lines[1]).toMatch(/^Fällig bei:/);
    expect(lines[1]).toContain('186.523');
  });

  it('km overdue, time not reached — Fällig am date + Fällig seit km', () => {
    const lines = formatPositionDueLines(
      pos({
        dueAtDate: '2027-06-05',
        dueAtKm: 210983,
        remainingDays: 90,
        remainingKm: -1200,
        dueState: 'OVERDUE',
      }),
      t,
      'de-DE',
    );
    expect(lines[0]).toMatch(/^Fällig am:/);
    expect(lines[1]).toMatch(/^Fällig seit:/);
    expect(lines[1]).toContain('210.983');
  });

  it('both overdue', () => {
    const lines = formatPositionDueLines(
      pos({
        dueAtDate: '2026-01-01',
        dueAtKm: 200000,
        remainingDays: -10,
        remainingKm: -50,
      }),
      t,
      'de-DE',
    );
    expect(lines.every((l) => l.startsWith('Fällig seit:'))).toBe(true);
  });

  it('date only', () => {
    const lines = formatPositionDueLines(
      pos({ dueAtDate: '2026-06-05', remainingDays: 30 }),
      t,
      'de-DE',
    );
    expect(lines).toEqual(['Fällig am: 05.06.2026']);
  });

  it('km only', () => {
    const lines = formatPositionDueLines(
      pos({ dueAtKm: 210983, remainingKm: 1000 }),
      t,
      'de-DE',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Fällig bei:/);
  });

  it('missing due thresholds', () => {
    expect(formatPositionDueLines(pos({}), t, 'de-DE')).toEqual([]);
  });
});
