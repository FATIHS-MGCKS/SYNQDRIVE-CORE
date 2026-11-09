import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  openHealthErrorsServiceModalHarness,
  serviceModalRoot,
} from './health-errors-service-modal-e2e-fixtures';

/**
 * UX-3.1 — real HealthErrorsView portal modal (mocked API). Not the DEV fixture shell.
 */
const artifactDir = '/opt/cursor/artifacts/service-info-v3-ux31-real-modal';

const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '1440', width: 1440, height: 900 },
] as const;

test.describe('Service Info V3 UX-3.1 — real HealthErrorsView service modal', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  test('auto-opens with focus on close control', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const modal = await openHealthErrorsServiceModalHarness(page);
    await expect(modal.getByRole('button', { name: /Schlie/i })).toBeFocused();
  });

  test('Escape and outside click close; focus returns to service quick card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHealthErrorsServiceModalHarness(page);
    await page.keyboard.press('Escape');
    await expect(serviceModalRoot(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(page.getByTestId('health-service-quick-card')).toBeFocused();

    await page.getByTestId('health-service-quick-card').click();
    await expect(serviceModalRoot(page)).toBeVisible();
    await page.locator('.overlay-scrim').last().click({ position: { x: 8, y: 8 }, force: true });
    await expect(serviceModalRoot(page)).toHaveCount(0, { timeout: 5_000 });
  });

  test('Tab focus stays inside modal shell', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const modal = await openHealthErrorsServiceModalHarness(page);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const modalEl = document.querySelector('[data-testid="service-info-v3-modal"]');
        const active = document.activeElement;
        return Boolean(modalEl && active && modalEl.contains(active));
      });
      expect(focused).toBe(true);
    }
  });

  test('body scroll locked while modal open', async ({ page }) => {
    await openHealthErrorsServiceModalHarness(page);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe('hidden');
  });

  test('compliance blocking TÜV visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const modal = await openHealthErrorsServiceModalHarness(page);
    await expect(modal.getByTestId('compliance-tuv')).toContainText('Nicht vermieten');
    await expect(modal.locator('#service-info-v3-modal-compliance-heading')).toHaveCount(1);
  });

  test('V3 tabs overview / plan / history', async ({ page }) => {
    const modal = await openHealthErrorsServiceModalHarness(page);
    await modal.getByRole('tab', { name: 'Wartungsplan' }).click();
    await expect(modal.getByRole('heading', { name: /Überfällig/i }).first()).toBeVisible();
    await modal.getByRole('tab', { name: 'Servicehistorie' }).click();
    await expect(modal.getByTestId('service-history-timeline')).toBeVisible();
    await modal.getByRole('tab', { name: 'Übersicht' }).click();
    await expect(modal.getByRole('tab', { name: 'Übersicht' })).toHaveAttribute('aria-selected', 'true');
  });

  test('nested manual service dialog receives focus (Radix)', async ({ page }) => {
    const modal = await openHealthErrorsServiceModalHarness(page);
    const manualBtn = modal.getByRole('button', { name: /Manueller Serviceeintrag/i });
    await manualBtn.scrollIntoViewIfNeeded();
    await manualBtn.click();
    const radixDialog = page.locator(
      '[data-slot="dialog-content"][data-state="open"], [data-radix-dialog-content][data-state="open"]',
    );
    await expect(radixDialog).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(radixDialog).toHaveCount(0);
    await expect(serviceModalRoot(page)).toBeVisible();
  });

  for (const vp of viewports) {
    test(`real modal screenshot light @ ${vp.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const modal = await openHealthErrorsServiceModalHarness(page);
      const overflow = await modal.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      await modal.screenshot({
        path: join(artifactDir, `real-modal-light-${vp.name}.png`),
      });
    });
  }

  test('real modal dark @ 390px', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    const modal = await openHealthErrorsServiceModalHarness(page, { theme: 'dark' });
    await modal.screenshot({ path: join(artifactDir, 'real-modal-dark-390.png') });
    await context.close();
  });
});
