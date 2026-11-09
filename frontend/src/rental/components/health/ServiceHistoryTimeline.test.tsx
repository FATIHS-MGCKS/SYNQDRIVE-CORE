// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../../i18n/locales';
import { MERCEDES_HISTORY_FIXTURE, mercedesHistoryPage2 } from './service-info-v3-fixture-data';
import { ServiceHistoryTimeline } from './ServiceHistoryTimeline';

const { serviceHistoryPage, pageResolvers } = vi.hoisted(() => {
  const pageResolvers: Array<{
    resolve: (v: unknown) => void;
    reject: (e?: unknown) => void;
  }> = [];
  const serviceHistoryPage = vi.fn(() => {
    return new Promise((resolve, reject) => {
      pageResolvers.push({ resolve, reject });
    });
  });
  return { serviceHistoryPage, pageResolvers };
});

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

type TimelineProps = ComponentProps<typeof ServiceHistoryTimeline>;

function renderTimeline(
  props: TimelineProps,
  opts?: { key?: string },
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        createElement(ServiceHistoryTimeline, { ...props, key: opts?.key }),
      ),
    );
  });
  return {
    container,
    rerender(next: TimelineProps) {
      act(() => {
        root.render(
          createElement(LanguageProvider, null, createElement(ServiceHistoryTimeline, { ...next })),
        );
      });
    },
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
    serviceHistoryPage.mockClear();
    pageResolvers.length = 0;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders chronological grouped rows with km unit and expands details', () => {
    const initial = MERCEDES_HISTORY_FIXTURE.slice(0, 2);
    const { container, cleanup: c } = renderTimeline({
      vehicleId: 'veh-1',
      initialItems: initial,
      initialNextCursor: null,
      initialHasMore: false,
      loading: false,
      error: false,
    });
    cleanup = c;
    expect(container.querySelector('[data-service-history-id="mh-2025-full"]')).toBeTruthy();
    expect(container.textContent).toMatch(/km/);
    const details = container.querySelector('[data-service-history-id="mh-2025-full"]') as HTMLDetailsElement;
    expect(details.tagName.toLowerCase()).toBe('details');
    act(() => {
      details.open = true;
    });
    expect(container.textContent).toContain('Durchgeführte Arbeiten');
  });

  it('does not use empty disclosure for sparse rows', () => {
    const { container, cleanup: c } = renderTimeline({
      vehicleId: 'veh-1',
      initialItems: [
        {
          id: 'sparse',
          eventType: 'OTHER',
          date: '2025-01-01',
          odometerKm: null,
          workshopName: null,
          notes: null,
          origin: 'MANUAL',
          externalSource: false,
        },
      ],
      initialHasMore: false,
      loading: false,
      error: false,
    });
    cleanup = c;
    const row = container.querySelector('[data-service-history-id="sparse"]');
    expect(row?.tagName.toLowerCase()).toBe('div');
  });

  it('dedupes duplicate ids when loading more', async () => {
    serviceHistoryPage.mockImplementationOnce(() =>
      Promise.resolve({
        items: mercedesHistoryPage2(),
        totalCount: 5,
        hasMore: false,
        nextCursor: null,
      }),
    );
    const initial = MERCEDES_HISTORY_FIXTURE.slice(0, 2);
    const { container, cleanup: c } = renderTimeline({
      vehicleId: 'veh-1',
      initialItems: initial,
      initialNextCursor: 'cursor-1',
      initialHasMore: true,
      loading: false,
      error: false,
    });
    cleanup = c;
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Weitere'));
    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });
    const ids = [...container.querySelectorAll('[data-service-history-id]')].map((el) =>
      el.getAttribute('data-service-history-id'),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('mh-2024-inspection');
  });

  it('ignores stale pagination after vehicle switch (generation guard)', async () => {
    const initialA = MERCEDES_HISTORY_FIXTURE.slice(0, 1);
    const initialB = [
      {
        id: 'veh-b-only',
        eventType: 'OIL_CHANGE',
        date: '2024-01-01',
        odometerKm: 12000,
        workshopName: null,
        notes: null,
        origin: 'MANUAL' as const,
        externalSource: false,
      },
    ];
    const { container, rerender, cleanup: c } = renderTimeline({
      vehicleId: 'veh-a',
      initialItems: initialA,
      initialNextCursor: 'cursor-a',
      initialHasMore: true,
      loading: false,
      error: false,
    });
    cleanup = c;
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Weitere'));
    await act(async () => {
      btn?.click();
    });
    expect(pageResolvers.length).toBe(1);

    rerender({
      vehicleId: 'veh-b',
      initialItems: initialB,
      initialNextCursor: null,
      initialHasMore: false,
      loading: false,
      error: false,
    });

    await act(async () => {
      pageResolvers[0]?.resolve({
        items: [
          {
            id: 'stale-from-veh-a',
            eventType: 'REPAIR',
            date: '2020-01-01',
            odometerKm: 1,
            workshopName: 'Should not appear',
            notes: null,
            origin: 'ONEAUTO',
            externalSource: true,
          },
        ],
        totalCount: 99,
        hasMore: true,
        nextCursor: 'stale-cursor',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Should not appear');
    expect(container.querySelector('[data-service-history-id="stale-from-veh-a"]')).toBeNull();
    expect(container.querySelector('[data-service-history-id="veh-b-only"]')).toBeTruthy();
  });

  it('offers a single retry control after pagination failure', async () => {
    serviceHistoryPage.mockRejectedValueOnce(new Error('network'));
    const initial = MERCEDES_HISTORY_FIXTURE.slice(0, 2);
    const { container, cleanup: c } = renderTimeline({
      vehicleId: 'veh-1',
      initialItems: initial,
      initialNextCursor: 'cursor-1',
      initialHasMore: true,
      loading: false,
      error: false,
    });
    cleanup = c;
    const loadMore = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Weitere'));
    await act(async () => {
      loadMore?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const retryButtons = [...container.querySelectorAll('button')].filter((b) =>
      b.textContent?.includes('Erneut laden'),
    );
    expect(retryButtons).toHaveLength(1);
    expect(container.textContent).toContain('konnten nicht geladen');
  });
});
