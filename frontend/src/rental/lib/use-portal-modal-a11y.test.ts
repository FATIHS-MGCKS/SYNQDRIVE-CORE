// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement, useRef, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  getFocusableElements,
  isRadixDialogOpen,
  isUnderNonFocusableAncestor,
  usePortalModalA11y,
} from './use-portal-modal-a11y';

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

  it('excludes focusables inside hidden tab panels', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button id="close">Close</button>
      <div role="tablist">
        <button role="tab">Übersicht</button>
        <button role="tab">Plan</button>
      </div>
      <div role="tabpanel" id="panel-overview" tabindex="0">
        <button id="visible">Visible</button>
      </div>
      <div role="tabpanel" id="panel-plan" hidden tabindex="0" class="hidden">
        <button id="hidden-plan">Hidden plan action</button>
      </div>
      <div role="tabpanel" id="panel-history" hidden tabindex="0">
        <button id="hidden-history">Hidden history</button>
      </div>
    `;
    const focusables = getFocusableElements(root);
    const ids = focusables.map((el) => el.id).filter(Boolean);
    expect(ids).toContain('close');
    expect(ids).toContain('visible');
    expect(ids).not.toContain('hidden-plan');
    expect(ids).not.toContain('hidden-history');
    expect(focusables.some((el) => el.id === 'panel-plan')).toBe(false);
    expect(focusables.some((el) => el.id === 'panel-history')).toBe(false);
  });

  it('isUnderNonFocusableAncestor respects inert and aria-hidden', () => {
    const root = document.createElement('div');
    const inertHost = document.createElement('div');
    inertHost.setAttribute('inert', '');
    const btn = document.createElement('button');
    inertHost.appendChild(btn);
    root.appendChild(inertHost);
    document.body.appendChild(root);
    expect(isUnderNonFocusableAncestor(btn, root)).toBe(true);
    document.body.removeChild(root);
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
