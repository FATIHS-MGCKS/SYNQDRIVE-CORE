// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MasterPageTabs } from './MasterPageTabs';

const TABS = [
  { id: 'a' as const, label: 'Alpha' },
  { id: 'b' as const, label: 'Beta' },
  { id: 'c' as const, label: 'Gamma', disabled: true },
];

function TabsHarness() {
  const [activeId, setActiveId] = useState<'a' | 'b' | 'c'>('a');
  return createElement(MasterPageTabs<'a' | 'b' | 'c'>, {
    tabs: TABS,
    activeId,
    onChange: setActiveId,
    ariaLabel: 'Test tabs',
    testIdPrefix: 'demo',
  });
}

function renderHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(TabsHarness));
  });
  return { container, root };
}

describe('MasterPageTabs keyboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves selection with ArrowRight and ArrowLeft (roving tabindex)', () => {
    const { container } = renderHarness();

    const tablist = container.querySelector('[data-testid="demo-tabbar"]') as HTMLElement;
    const tabA = container.querySelector('[data-testid="demo-tab-a"]') as HTMLButtonElement;
    const tabB = container.querySelector('[data-testid="demo-tab-b"]') as HTMLButtonElement;

    expect(tabA.getAttribute('tabindex')).toBe('0');
    expect(tabB.getAttribute('tabindex')).toBe('-1');
    expect(tabA.getAttribute('aria-controls')).toBe('demo-panel-a');

    act(() => {
      tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(tabB);
    expect(tabB.getAttribute('aria-selected')).toBe('true');

    act(() => {
      tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement).toBe(tabA);
    expect(tabA.getAttribute('aria-selected')).toBe('true');

    act(() => {
      tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(tabB);

    act(() => {
      tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(document.activeElement).toBe(tabA);
  });
});
