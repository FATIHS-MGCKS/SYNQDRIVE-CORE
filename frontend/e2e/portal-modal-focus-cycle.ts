import { expect, type Locator, type Page } from '@playwright/test';

const MODAL_TEST_ID = 'service-info-v3-modal';

/** Mirrors production `getFocusableElements` in the browser for E2E assertions. */
export async function countVisibleModalFocusables(modal: Locator): Promise<number> {
  return modal.evaluate((root) => {
    const FOCUSABLE_SELECTOR =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const isUnderNonFocusableAncestor = (el: HTMLElement, boundary: HTMLElement): boolean => {
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
    };

    const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    return nodes.filter((el) => {
      if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      if (isUnderNonFocusableAncestor(el, root)) return false;
      return true;
    }).length;
  });
}

function activeElementDescriptor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || !(active instanceof HTMLElement)) return '';
    const parts: string[] = [];
    let node: HTMLElement | null = active;
    while (node) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      const idx = parent ? Array.from(parent.children).indexOf(node) : 0;
      const extra = node.id ? `#${node.id}` : '';
      parts.unshift(`${tag}${extra}[${idx}]`);
      node = parent;
    }
    return parts.join('/');
  });
}

function isFocusInsideModal(page: Page): Promise<boolean> {
  return page.evaluate((testId) => {
    const modalEl = document.querySelector(`[data-testid="${testId}"]`);
    const active = document.activeElement;
    return Boolean(modalEl && active && modalEl.contains(active));
  }, MODAL_TEST_ID);
}

export type TabCycleResult = {
  steps: number;
  visited: string[];
};

/** Forward Tab until the starting descriptor repeats. */
export async function runForwardTabCycle(page: Page): Promise<TabCycleResult> {
  const start = await activeElementDescriptor(page);
  expect(start.length).toBeGreaterThan(0);
  const visited: string[] = [];

  const maxSteps = 120;
  for (let step = 1; step <= maxSteps; step += 1) {
    await page.keyboard.press('Tab');
    expect(await isFocusInsideModal(page)).toBe(true);
    const current = await activeElementDescriptor(page);
    await assertNoFocusInsideHiddenTabPanels(page.locator(`[data-testid="${MODAL_TEST_ID}"]`));
    visited.push(current);
    if (current === start) {
      return { steps: step, visited };
    }
  }
  throw new Error(`Forward tab cycle did not complete within ${maxSteps} steps`);
}

/** Shift+Tab from start until we wrap back to start. */
export async function runReverseTabCycle(page: Page): Promise<TabCycleResult> {
  const start = await activeElementDescriptor(page);
  const visited: string[] = [];
  const maxSteps = 120;
  for (let step = 1; step <= maxSteps; step += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await isFocusInsideModal(page)).toBe(true);
    const current = await activeElementDescriptor(page);
    await assertNoFocusInsideHiddenTabPanels(page.locator(`[data-testid="${MODAL_TEST_ID}"]`));
    visited.push(current);
    if (current === start) {
      return { steps: step, visited };
    }
  }
  throw new Error(`Reverse tab cycle did not complete within ${maxSteps} steps`);
}

/** Naive focusable count (ignores hidden ancestors) — regression baseline. */
export async function countNaiveModalFocusables(modal: Locator): Promise<number> {
  return modal.evaluate((root) => {
    const sel =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return root.querySelectorAll<HTMLElement>(sel).length;
  });
}

export async function assertNoFocusInsideHiddenTabPanels(modal: Locator): Promise<void> {
  const offenders = await modal.evaluate((root) => {
    const hiddenPanels = root.querySelectorAll<HTMLElement>('[role="tabpanel"][hidden]');
    const active = document.activeElement;
    if (!active || !(active instanceof HTMLElement)) return [];
    const hits: string[] = [];
    hiddenPanels.forEach((panel) => {
      if (panel.contains(active)) {
        hits.push(panel.id || 'hidden-panel');
      }
    });
    return hits;
  });
  expect(offenders).toEqual([]);
}
