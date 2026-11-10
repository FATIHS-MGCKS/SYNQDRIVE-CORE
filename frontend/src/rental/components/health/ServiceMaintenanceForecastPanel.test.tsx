// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MaintenanceForecastResult, MaintenancePositionForecast, ServiceInfoStatus } from '../../../lib/api';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { baseForecast, iphoneUx32OverdueFixture } from './service-info-v3-fixture-data';
import { ServiceMaintenanceForecastPanel } from './ServiceMaintenanceForecastPanel';

function renderPanel(
  serviceInfo: ServiceInfoStatus | null,
  opts?: {
    loading?: boolean;
    error?: boolean;
    compact?: boolean;
    key?: string;
    surface?: 'full' | 'overview' | 'plan';
    onOpenPlanTab?: () => void;
  },
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(ServiceMaintenanceForecastPanel, {
          key: opts?.key,
          serviceInfo,
          loading: opts?.loading ?? false,
          error: opts?.error ?? false,
          vehicleId: 'veh-test',
          orgId: 'org-test',
          compact: opts?.compact ?? false,
          surface: opts?.surface,
          onOpenPlanTab: opts?.onOpenPlanTab,
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

function overduePosition(id: string, overrides?: Partial<MaintenancePositionForecast>): MaintenancePositionForecast {
  return {
    positionId: id,
    kind: 'INSPECTION',
    label: 'Inspektion',
    intervalMode: 'RECURRING',
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
    computationMode: 'KM_AND_TIME',
    severity: 'WARNING',
    provenance: {
      scheduleSource: 'ONEAUTO_SCHEDULE',
      eventSource: 'SERVICE_EVENT_ONEAUTO',
      odometerSource: 'VEHICLE_LATEST_STATE',
      calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
    },
    dataQuality: [],
    ...overrides,
  };
}

describe('ServiceMaintenanceForecastPanel UX-1.1', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('shows empty-plan hint for Mercedes history without schedule when forecast has no positions', () => {
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
    } as unknown as ServiceInfoStatus;

    const view = renderPanel(serviceInfo);
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain('Servicehistorie vorhanden');
  });

  it('handles Mercedes with null maintenanceForecast payload', () => {
    const view = renderPanel({
      hasServiceHistory: true,
      maintenanceForecast: null,
      nextService: null,
    } as unknown as ServiceInfoStatus);
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain('Wartung & Service');
    expect(view.container.textContent).toContain('Servicehistorie vorhanden');
    const planHeading = [...view.container.querySelectorAll('h3')].find((el) => el.textContent === 'Wartungsplan');
    expect(planHeading).toBeUndefined();
  });

  it('keeps single overdue headline position visible in plan with badge', () => {
    const headlineId = 'only-overdue';
    const pos = overduePosition(headlineId);
    const serviceInfo: ServiceInfoStatus = {
      maintenanceForecast: baseForecast({
        scheduleSources: ['ONEAUTO_SCHEDULE'],
        positions: [pos],
        nextDue: pos,
      }),
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'COMPUTED_ONEAUTO_SCHEDULE',
        positionId: headlineId,
        positionKind: 'INSPECTION',
        positionLabel: 'Inspektion',
        remainingKm: -1200,
        remainingDays: -14,
        dueImminent: true,
        overdue: true,
        stale: false,
        computedComparison: null,
      },
    } as unknown as ServiceInfoStatus;

    const view = renderPanel(serviceInfo);
    cleanup = view.cleanup;
    const text = view.container.textContent ?? '';
    expect(text).toContain('Überfällig');
    expect(text).toContain('Hervorgehoben in der Übersicht');
    expect(text).not.toContain('Keine planbaren Wartungspositionen');
  });

  it('does not show empty plan when positions exist', () => {
    const serviceInfo: ServiceInfoStatus = {
      maintenanceForecast: baseForecast({
        scheduleSources: ['ONEAUTO_SCHEDULE'],
        positions: [overduePosition('p1'), overduePosition('p2', { dueState: 'NO_BASELINE', baseline: null, remainingKm: null, remainingDays: null })],
      }),
    } as unknown as ServiceInfoStatus;
    const view = renderPanel(serviceInfo);
    cleanup = view.cleanup;
    expect(view.container.textContent).not.toContain('Keine planbaren Wartungspositionen');
  });

  it('renders provenance even without raw text, flags, or baseline', () => {
    const bare = overduePosition('bare', {
      dueState: 'NO_BASELINE',
      baseline: null,
      rawIntervalDescription: null,
      dataQuality: [],
      provenance: {
        scheduleSource: 'ONEAUTO_SCHEDULE',
        eventSource: 'NONE',
        odometerSource: 'VEHICLE_LATEST_STATE',
        calculationMethod: 'NOT_COMPUTABLE',
      },
    });
    const view = renderPanel({
      maintenanceForecast: baseForecast({ positions: [bare] }),
    } as unknown as ServiceInfoStatus);
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain('Letzte Durchführung nicht nachgewiesen');
    expect(view.container.textContent).not.toMatch(/Zuletzt nachgewiesen:.*nicht nachgewiesen/);
    expect(view.container.textContent).not.toContain('health.serviceInfo.v3.details.toggle');
  });

  it('uses unique accessibility ids for multiple panel instances', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const info = {
      maintenanceForecast: baseForecast({ positions: [overduePosition('a')] }),
    } as unknown as ServiceInfoStatus;
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement('div', null, [
            createElement(ServiceMaintenanceForecastPanel, { key: '1', serviceInfo: info, loading: false, error: false, vehicleId: 'v1', orgId: 'o1' }),
            createElement(ServiceMaintenanceForecastPanel, { key: '2', serviceInfo: info, loading: false, error: false, vehicleId: 'v2', orgId: 'o1' }),
          ]),
        ),
      );
    });
    const heroes = container.querySelectorAll('[id$="-hero"]');
    expect(heroes.length).toBe(2);
    expect(heroes[0]?.id).not.toBe(heroes[1]?.id);
    act(() => root.unmount());
    container.remove();
  });

  it('shows loading and error states from display mapper', () => {
    const loading = renderPanel(null, { loading: true });
    expect(loading.container.textContent).toContain('Wird geladen');
    loading.cleanup();
    const err = renderPanel(null, { error: true });
    expect(err.container.textContent).toContain('nicht verfügbar');
    err.cleanup();
  });

  it('keeps not-computable group collapsed (native details)', () => {
    const serviceInfo: ServiceInfoStatus = {
      maintenanceForecast: baseForecast({
        scheduleSources: ['ONEAUTO_SCHEDULE'],
        positions: [overduePosition('nb', { dueState: 'NO_BASELINE', baseline: null, remainingKm: null, remainingDays: null })],
      }),
    } as unknown as ServiceInfoStatus;
    const view = renderPanel(serviceInfo);
    cleanup = view.cleanup;
    const details = view.container.querySelector('details');
    expect(details).toBeTruthy();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('overview omits global last-maintenance summary card (trust fix)', () => {
    const view = renderPanel(iphoneUx32OverdueFixture(), { surface: 'overview' });
    cleanup = view.cleanup;
    expect(view.container.textContent).not.toContain('Letzte relevante Wartung');
    expect(view.container.textContent).toContain('Kilometerstand');
  });

  it('overview lists three overdue positions with not-computable footer (UX-3.2)', () => {
    const serviceInfo = iphoneUx32OverdueFixture();
    const view = renderPanel(serviceInfo, { surface: 'overview' });
    cleanup = view.cleanup;
    const text = view.container.textContent ?? '';
    expect(text).toMatch(/3 Wartungen überfällig/);
    expect(text).toContain('963');
    expect(text).toContain('Bremsflüssigkeit');
    expect(text).toContain('Ölwechsel');
    expect(text).toContain('1.546');
    expect(text).toContain('Zündkerzen');
    expect(text).toMatch(/11 weitere Positionen nicht berechenbar/);
    const overdueItems = view.container.querySelectorAll('[data-testid^="service-overdue-item-"]');
    expect(overdueItems.length).toBe(3);
  });

  it('plan row shows verified baseline for oil without details toggle (UX-3.2)', () => {
    const serviceInfo = iphoneUx32OverdueFixture();
    const view = renderPanel(serviceInfo, { surface: 'plan' });
    cleanup = view.cleanup;
    const oil = view.container.querySelector('[data-testid="service-plan-position-p-oil"]');
    expect(oil).toBeTruthy();
    const oilText = oil?.textContent ?? '';
    expect(oilText).toContain('Zuletzt dokumentiert');
    expect(oilText).toContain('170.430');
    expect(oilText).toContain('Intervall');
    expect(oilText).not.toMatch(/^\s*Details\s*$/m);
    expect(view.container.querySelector('[data-testid="service-plan-position-p-oil"] details')).toBeNull();
  });

  it('plan row uses Fällig seit + Fällig bei when only calendar is overdue (UX-3.2 polish)', () => {
    const mixed = overduePosition('mixed-due', {
      dueAtDate: '2026-03-20',
      dueAtKm: 186523,
      remainingDays: -235,
      remainingKm: 500,
      dueState: 'OVERDUE',
    });
    const view = renderPanel(
      {
        maintenanceForecast: baseForecast({ scheduleSources: ['ONEAUTO_SCHEDULE'], positions: [mixed] }),
      } as unknown as ServiceInfoStatus,
      { surface: 'plan' },
    );
    cleanup = view.cleanup;
    const row = view.container.querySelector('[data-testid="service-plan-position-mixed-due"]');
    const text = row?.textContent ?? '';
    expect(text).toContain('Fällig seit:');
    expect(text).toContain('Fällig bei:');
  });

  it('master-data baseline uses calculation basis label', () => {
    const serviceInfo = iphoneUx32OverdueFixture();
    const view = renderPanel(serviceInfo, { surface: 'plan' });
    cleanup = view.cleanup;
    const md = view.container.querySelector('[data-testid="service-plan-position-p-md-only"]');
    expect(md?.textContent).toContain('Berechnungsgrundlage');
    expect(md?.textContent).not.toContain('Zuletzt dokumentiert');
  });

  it('surfaces conflict list when forecast provides conflicts', () => {
    const view = renderPanel({
      maintenanceForecast: baseForecast({
        conflicts: [{ code: 'ODOMETER_BELOW_BASELINE', positionId: 'p1', hmRemainingKm: null, computedRemainingKm: null, hmRemainingDays: null, computedRemainingDays: null }],
      }),
    } as unknown as ServiceInfoStatus);
    cleanup = view.cleanup;
    expect(view.container.textContent).toContain('Quellenkonflikt');
  });
});
