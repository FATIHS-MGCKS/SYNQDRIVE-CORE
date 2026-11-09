import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ancestors (below boundary) that hide content from the accessibility / focus order. */
export function isUnderNonFocusableAncestor(el: HTMLElement, boundary: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== boundary) {
    if (node.hasAttribute('hidden') || node.hidden) return true;
    if (node.hasAttribute('inert')) return true;
    if (node.getAttribute('aria-hidden') === 'true') return true;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    node = node.parentElement;
  }
  return false;
}

function isDirectlyFocusableVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return true;
}

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter((el) => {
    if (!isDirectlyFocusableVisible(el)) return false;
    if (isUnderNonFocusableAncestor(el, root)) return false;
    return true;
  });
}

/** True when a Radix dialog (manual service, intervals, etc.) is open above the portal shell. */
export function isRadixDialogOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"], [data-radix-dialog-content][data-state="open"]',
    ),
  );
}

function isWeakFocusRestoreTarget(el: HTMLElement | null): boolean {
  if (!el) return true;
  if (el === document.body || el === document.documentElement) return true;
  const tag = el.tagName;
  return tag === 'BODY' || tag === 'HTML';
}

export interface UsePortalModalA11yOptions {
  /** Modal is mounted and should trap focus / lock scroll. */
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onRequestClose: () => void;
  enableEscape?: boolean;
  /** When false, skip initial autofocus (e.g. while enter animation runs). */
  focusReady?: boolean;
  /** Focus target after close when the opener is no longer focusable (e.g. auto-opened modal). */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

export function usePortalModalA11y({
  active,
  containerRef,
  initialFocusRef,
  onRequestClose,
  enableEscape = true,
  focusReady = true,
  restoreFocusRef,
}: UsePortalModalA11yOptions): void {
  const lastFocusedBeforeOpenRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    lastFocusedBeforeOpenRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      body.style.overflow = previousOverflow === 'hidden' ? '' : previousOverflow;
      const previous = lastFocusedBeforeOpenRef.current;
      const fallbackEl = restoreFocusRef?.current ?? null;
      const target =
        previous &&
        !isWeakFocusRestoreTarget(previous) &&
        typeof previous.focus === 'function' &&
        document.contains(previous)
          ? previous
          : fallbackEl && typeof fallbackEl.focus === 'function' && document.contains(fallbackEl)
            ? fallbackEl
            : null;
      target?.focus();
      lastFocusedBeforeOpenRef.current = null;
    };
  }, [active, restoreFocusRef]);

  useEffect(() => {
    if (!active || !focusReady) return;
    const container = containerRef.current;
    if (!container) return;

    const focusInitial = () => {
      const preferred = initialFocusRef?.current;
      if (preferred) {
        preferred.focus();
        return;
      }
      const focusables = getFocusableElements(container);
      focusables[0]?.focus();
    };

    const id = window.requestAnimationFrame(focusInitial);
    return () => window.cancelAnimationFrame(id);
  }, [active, focusReady, containerRef, initialFocusRef]);

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isRadixDialogOpen()) return;

      const container = containerRef.current;
      if (!container) return;

      if (event.key === 'Escape' && enableEscape) {
        event.preventDefault();
        event.stopPropagation();
        onRequestClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const idx = current ? focusables.indexOf(current) : -1;

      if (event.shiftKey) {
        if (idx <= 0) {
          event.preventDefault();
          last.focus();
        }
      } else if (idx === focusables.length - 1 || idx === -1) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, containerRef, onRequestClose, enableEscape]);
}
