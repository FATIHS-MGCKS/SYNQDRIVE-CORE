// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement, useRef, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { getFocusableElements, isRadixDialogOpen, usePortalModalA11y } from './use-portal-modal-a11y';

function Harness({
  active,
  onClose,
  restoreFocusRef,
}: {
  active: boolean;
  onClose: () => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  usePortalModalA11y({
    active,
    containerRef,
    initialFocusRef: closeRef,
    restoreFocusRef,
    onRequestClose: onClose,
    focusReady: active,
  });
  return createElement(
    'div',
    { ref: containerRef, role: 'dialog', tabIndex: -1 },
    createElement('button', { type: 'button', ref: closeRef }, 'Close'),
    createElement('button', { type: 'button' }, 'Next'),
  );
}

describe('use-portal-modal-a11y', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('collects focusable elements', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button id="a">A</button><a href="/x">B</a>';
    expect(getFocusableElements(root).length).toBe(2);
  });

  it('detects radix dialog sentinel', () => {
    expect(isRadixDialogOpen()).toBe(false);
    const el = document.createElement('div');
    el.setAttribute('data-radix-dialog-content', '');
    el.setAttribute('data-state', 'open');
    document.body.appendChild(el);
    expect(isRadixDialogOpen()).toBe(true);
  });

  it('locks body scroll while active', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onClose = vi.fn();
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(Harness, { active: true, onClose }));
    });
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => {
      root.render(createElement(Harness, { active: false, onClose }));
    });
    expect(document.body.style.overflow).toBe('');
    root.unmount();
  });

  it('restores focus to fallback ref after close', async () => {
    const trigger = document.createElement('button');
    trigger.id = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const onClose = vi.fn();
    const restoreRef = { current: trigger } as RefObject<HTMLElement>;
    const root = createRoot(mount);
    await act(async () => {
      root.render(createElement(Harness, { active: true, onClose, restoreFocusRef: restoreRef }));
    });

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement?.textContent).toBe('Close');

    await act(async () => {
      root.render(createElement(Harness, { active: false, onClose, restoreFocusRef: restoreRef }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement?.id).toBe('trigger');
    root.unmount();
  });

  it('calls onRequestClose on Escape', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onClose = vi.fn();
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(Harness, { active: true, onClose }));
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});
