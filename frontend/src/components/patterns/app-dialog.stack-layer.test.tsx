// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppDialog } from './app-dialog';

describe('AppDialog stackLayer', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses z-[80] on overlay and content by default', async () => {
    await act(async () => {
      root.render(
        createElement(AppDialog, {
          open: true,
          onOpenChange: vi.fn(),
          children: createElement('p', { 'data-testid': 'dialog-body' }, 'body'),
        }),
      );
    });

    const panel = document.querySelector('.sq-dialog-panel');
    const overlay = document.querySelector('.overlay-scrim.fixed.inset-0');
    expect(panel?.className.includes('z-[80]')).toBe(true);
    expect(overlay?.className.includes('z-[80]')).toBe(true);
    expect(document.querySelector('[data-testid="app-dialog-overlay-elevated"]')).toBeNull();
  });

  it('uses z-[110] for aboveRegistrationShell on overlay and content', async () => {
    await act(async () => {
      root.render(
        createElement(AppDialog, {
          open: true,
          onOpenChange: vi.fn(),
          stackLayer: 'aboveRegistrationShell',
          children: createElement('p', { 'data-testid': 'dialog-body' }, 'body'),
        }),
      );
    });

    const panel = document.querySelector('.sq-dialog-panel');
    const overlay = document.querySelector('[data-testid="app-dialog-overlay-elevated"]');
    expect(panel?.className.includes('z-[110]')).toBe(true);
    expect(overlay?.className.includes('z-[110]')).toBe(true);
  });
});
