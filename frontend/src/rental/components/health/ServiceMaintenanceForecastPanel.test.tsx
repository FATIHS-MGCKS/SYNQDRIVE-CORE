// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaintenanceForecastResult, ServiceInfoStatus } from '../../../lib/api';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { ServiceMaintenanceForecastPanel } from './ServiceMaintenanceForecastPanel';

function baseForecast(partial: Partial<MaintenanceForecastResult>): MaintenanceForecastResult {
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
    ...partial,
  };
}

function renderPanel(serviceInfo: ServiceInfoStatus | null) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(ServiceMaintenanceForecastPanel, {
          serviceInfo,
          loading: false,
          error: false,
          vehicleId: 'veh-test',
          orgId: 'org-test',
        }),
      ),
    );
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('ServiceMaintenanceForecastPanel UX-1', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders page title and Mercedes-style empty plan hint (history without schedule)', () => {
    const serviceInfo: ServiceInfoStatus = {
      maintenanceForecast: baseForecast({
        lastRelevantMaintenance: {
          date: '2025-06-01',
          odometerKm: 42000,
          eventId: 'ev-1',
          eventType: 'FULL_SERVICE',
          eventSource: 'SERVICE_EVENT_ONEAUTO',
        },
        dataQuality: ['SCHEDULE_MISSING'],
        scheduleSources: [],
      }),
      nextService: null,
      serviceOverdue: false,
      serviceDueImminently: false,
      tuvOverdue: false,
      bokraftOverdue: false,
    } as ServiceInfoStatus;

    const view = renderPanel(serviceInfo);
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain('Wartung & Service');
    expect(view.container.textContent).toContain('Servicehistorie vorhanden');
    expect(view.container.textContent).not.toContain('sq-tone-critical');
  });

  it('groups Arteon-style overdue and not-computable positions separately', () => {
    const serviceInfo: ServiceInfoStatus = {
      maintenanceForecast: baseForecast({
        scheduleSources: ['ONEAUTO_SCHEDULE'],
        dataQuality: [],
        positions: [
          {
            positionId: 'p-overdue',
            kind: 'INSPECTION',
            label: 'Inspektion',
            intervalMode: 'KM_OR_MONTHS',
            intervalKm: 30000,
            intervalMonths: 24,
            rawIntervalDescription: null,
            baseline: { date: '2024-01-01', odometerKm: 30000, eventId: 'e1', eventType: 'FULL_SERVICE', eventSource: 'SERVICE_EVENT_ONEAUTO' },
            dueAtKm: 60000,
            dueAtDate: '2026-01-01',
            remainingKm: -1200,
            remainingDays: -14,
            remainingMonths: null,
            dueState: 'OVERDUE',
            computationMode: 'TIME_AND_DISTANCE',
            severity: 'WARNING',
            provenance: {
              scheduleSource: 'ONEAUTO_SCHEDULE',
              eventSource: 'SERVICE_EVENT_ONEAUTO',
              odometerSource: 'VEHICLE_LATEST_STATE',
              calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
            },
            dataQuality: [],
          },
          {
            positionId: 'p-nobase',
            kind: 'OIL_CHANGE',
            label: 'Ölwechsel',
            intervalMode: 'KM_OR_MONTHS',
            intervalKm: 15000,
            intervalMonths: 12,
            rawIntervalDescription: 'Ölwechsel Premium Longlife',
            baseline: null,
            dueAtKm: null,
            dueAtDate: null,
            remainingKm: null,
            remainingDays: null,
            remainingMonths: null,
            dueState: 'NO_BASELINE',
            computationMode: 'TIME_AND_DISTANCE',
            severity: 'INFO',
            provenance: {
              scheduleSource: 'ONEAUTO_SCHEDULE',
              eventSource: 'NONE',
              odometerSource: 'VEHICLE_LATEST_STATE',
              calculationMethod: 'NOT_COMPUTABLE',
            },
            dataQuality: ['BASELINE_ODOMETER_MISSING'],
          },
        ],
        nextDue: null,
        unscheduledPositions: [{ positionId: 'u1', label: 'Zusatzposition ohne Intervall', scheduleSource: 'ONEAUTO_SCHEDULE' }],
      }),
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'COMPUTED_ONEAUTO_SCHEDULE',
        positionId: 'headline',
        positionKind: 'INSPECTION',
        positionLabel: 'Nächste Inspektion',
        remainingKm: -1200,
        remainingDays: -14,
        dueImminent: true,
        overdue: true,
        stale: false,
        computedComparison: null,
      },
      serviceOverdue: true,
      serviceDueImminently: true,
      tuvOverdue: false,
      bokraftOverdue: false,
    } as ServiceInfoStatus;

    const view = renderPanel(serviceInfo);
    cleanup = view.cleanup;
    const text = view.container.textContent ?? '';
    expect(text).toContain('Überfällig');
    expect(text).toContain('Nicht berechenbar');
    expect(text).toContain('Zusatzposition ohne Intervall');
    expect(text).toContain('Berechnete Empfehlung');
  });
});
