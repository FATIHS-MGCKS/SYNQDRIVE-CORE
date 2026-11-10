import { describe, expect, it } from 'vitest';
import type { MaintenancePositionForecast } from '../../lib/api';
import { formatPositionBaselineDisplay } from './service-info-position-baseline-display';

const t = (key: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    'health.serviceInfo.v3.ux32.baseline.verifiedLabel': 'Zuletzt nachgewiesen:',
    'health.serviceInfo.v3.ux32.baseline.documentedLabel': 'Zuletzt dokumentiert:',
    'health.serviceInfo.v3.ux32.baseline.userDeclaredLabel': 'Manuell eingetragen:',
    'health.serviceInfo.v3.ux32.baseline.verifiedValue': '{date} · {km} km',
    'health.serviceInfo.v3.ux32.baseline.calculationBasisLabel': 'Berechnungsgrundlage:',
    'health.serviceInfo.v3.ux32.baseline.calculationBasisDate': '{date}',
    'health.serviceInfo.v3.ux32.baseline.notProven': 'Letzte Durchführung nicht nachgewiesen',
    'health.serviceInfo.v3.ux32.baseline.verifiedDateOnly': '{date}',
    'health.serviceInfo.v3.ux32.baseline.verifiedKmOnly': '{km} km',
    'health.serviceInfo.v3.ux32.baseline.odometerUndocumented': 'Kilometerstand nicht dokumentiert',
    'health.serviceInfo.v3.ux32.baseline.calculationBasisBoth': '{date} · {km} km',
    'health.serviceInfo.v3.ux32.baseline.calculationBasisKm': '{km} km',
  };
  const raw = map[key] ?? key;
  return Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), raw);
};

function basePos(partial: Partial<MaintenancePositionForecast>): MaintenancePositionForecast {
  return {
    positionId: 'p',
    kind: 'OIL_CHANGE',
    label: 'Öl',
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
    dueState: 'NO_BASELINE',
    computationMode: 'NOT_COMPUTABLE',
    severity: 'INFO',
    provenance: {
      scheduleSource: 'ONEAUTO_SCHEDULE',
      eventSource: 'NONE',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'NOT_COMPUTABLE',
    },
    dataQuality: [],
    ...partial,
  };
}

describe('formatPositionBaselineDisplay', () => {
  it('documented position-specific event', () => {
    const d = formatPositionBaselineDisplay(
      basePos({
        baseline: {
          date: '2025-03-20',
          odometerKm: 170430,
          eventId: 'e1',
          eventType: 'OIL_CHANGE',
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          evidenceClass: 'DOCUMENTED',
        },
      }),
      t as never,
      'de-DE',
    );
    expect(d.kind).toBe('labeled');
    if (d.kind === 'labeled') {
      expect(d.label).toBe('Zuletzt dokumentiert:');
      expect(d.value).toContain('170.430');
    }
  });

  it('user-declared manual event', () => {
    const d = formatPositionBaselineDisplay(
      basePos({
        baseline: {
          date: '2025-03-20',
          odometerKm: 170430,
          eventId: 'e1',
          eventType: 'OIL_CHANGE',
          eventSource: 'SERVICE_EVENT_MANUAL',
          evidenceClass: 'USER_DECLARED',
        },
      }),
      t as never,
      'de-DE',
    );
    if (d.kind === 'labeled') {
      expect(d.label).toBe('Manuell eingetragen:');
    }
  });

  it('calculation basis only', () => {
    const d = formatPositionBaselineDisplay(
      basePos({
        baseline: {
          date: '2022-03-22',
          odometerKm: null,
          eventId: null,
          eventType: null,
          eventSource: 'VEHICLE_MASTER_DATA',
        },
        dataQuality: ['BASELINE_FROM_MASTER_DATA'],
      }),
      t as never,
      'de-DE',
    );
    expect(d.kind).toBe('labeled');
    if (d.kind === 'labeled') {
      expect(d.label).toBe('Berechnungsgrundlage:');
    }
  });

  it('missing evidence — standalone not proven', () => {
    const d = formatPositionBaselineDisplay(basePos({ baseline: null }), t as never, 'de-DE');
    expect(d.kind).toBe('standalone');
    if (d.kind === 'standalone') {
      expect(d.text).toBe('Letzte Durchführung nicht nachgewiesen');
      expect(d.text).not.toContain('Zuletzt nachgewiesen');
    }
  });
});
