// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { arteonFixtureWithHistory } from './service-info-v3-fixture-data';
import { ServiceInfoV3Panel } from './ServiceInfoV3Panel';

describe('ServiceInfoV3Panel tab keyboard navigation', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('supports ArrowRight/Home and stable aria-controls', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(ServiceInfoV3Panel, {
            serviceInfo: arteonFixtureWithHistory(),
            loading: false,
            error: false,
            vehicleId: 'veh-arteon',
            orgId: 'org-fixture',
          }),
        ),
      );
    });
    cleanup = () => {
      act(() => root.unmount());
      container.remove();
    };

    const overview = container.querySelector('[role="tab"][aria-selected="true"]') as HTMLButtonElement;
    expect(overview.textContent).toContain('Übersicht');
    const controls = overview.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(controls!)}`)?.getAttribute('role')).toBe('tabpanel');

    act(() => {
      overview.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const plan = container.querySelector('[role="tab"][aria-selected="true"]') as HTMLButtonElement;
    expect(plan.textContent).toContain('Wartungsplan');

    act(() => {
      plan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    const backOverview = container.querySelector('[role="tab"][aria-selected="true"]') as HTMLButtonElement;
    expect(backOverview.textContent).toContain('Übersicht');
    expect(backOverview.tabIndex).toBe(0);
  });
});
