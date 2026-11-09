// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { MERCEDES_HISTORY_FIXTURE, mercedesHistoryPage2 } from './service-info-v3-fixture-data';
import { ServiceHistoryTimeline } from './ServiceHistoryTimeline';

const { serviceHistoryPage } = vi.hoisted(() => ({
  serviceHistoryPage: vi.fn(),
}));

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      vehicleIntelligence: {
        ...actual.api.vehicleIntelligence,
        serviceHistoryPage,
      },
    },
  };
});

function renderTimeline(props: Partial<React.ComponentProps<typeof ServiceHistoryTimeline>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const initial = MERCEDES_HISTORY_FIXTURE.slice(0, 2);
  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(ServiceHistoryTimeline, {
          vehicleId: 'veh-1',
          initialItems: initial,
          initialNextCursor: 'cursor-1',
          initialHasMore: true,
          loading: false,
          error: false,
          ...props,
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

describe('ServiceHistoryTimeline', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    serviceHistoryPage.mockReset();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders chronological grouped rows and expands details', () => {
    const { container, cleanup: c } = renderTimeline();
    cleanup = c;
    expect(container.querySelector('[data-service-history-id="mh-2025-full"]')).toBeTruthy();
    expect(container.textContent).toContain('2025');
    const details = container.querySelector('[data-service-history-id="mh-2025-full"]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    act(() => {
      details.open = true;
    });
    expect(container.textContent).toContain('Durchgeführte Arbeiten');
  });

  it('dedupes duplicate ids when loading more', async () => {
    serviceHistoryPage.mockResolvedValue({
      items: mercedesHistoryPage2(),
      totalCount: 5,
      hasMore: false,
      nextCursor: null,
    });
    const { container, cleanup: c } = renderTimeline();
    cleanup = c;
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Weitere'));
    expect(btn).toBeTruthy();
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const ids = [...container.querySelectorAll('[data-service-history-id]')].map((el) =>
      el.getAttribute('data-service-history-id'),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('mh-2024-inspection');
  });

  it('shows load-more retry state on failure', async () => {
    serviceHistoryPage.mockRejectedValue(new Error('network'));
    const { container, cleanup: c } = renderTimeline();
    cleanup = c;
    const loadMore = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Weitere'));
    await act(async () => {
      loadMore?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('konnten nicht geladen');
  });
});
