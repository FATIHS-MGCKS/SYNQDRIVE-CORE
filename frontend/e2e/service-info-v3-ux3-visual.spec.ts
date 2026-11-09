import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir = '/opt/cursor/artifacts/service-info-v3-ux3';

const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

test.describe('Service Info V3 UX-3 final integration fixture', () => {
  test.describe.configure({ mode: 'parallel' });

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  for (const vp of viewports) {
    test(`Modal shell + compliance light @ ${vp.name}px`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('synqdrive.locale', 'de');
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dev/service-info-v3');
      const modalFixture = page.getByTestId('fixture-modal-arteon');
      await expect(modalFixture).toBeVisible();
      await expect(modalFixture.getByTestId('service-info-v3-compliance')).toBeVisible();
      await expect(modalFixture.getByTestId('compliance-tuv')).toBeVisible();
      const titles = await modalFixture.locator('#fixture-modal-arteon-title, h2#service-info-v3-modal-title').count();
      expect(titles).toBeLessThanOrEqual(1);
      const overflow = await modalFixture.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      await modalFixture.screenshot({
        path: join(artifactDir, `modal-arteon-compliance-light-${vp.name}.png`),
      });
    });
  }

  test('Modal presentation: single page title (no duplicate in panel)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const modalFixture = page.getByTestId('fixture-modal-arteon');
    await expect(modalFixture.getByRole('heading', { name: 'Wartung & Service' })).toHaveCount(1);
    await expect(modalFixture.getByRole('tab', { name: 'Übersicht' })).toBeVisible();
  });

  test('Blocking TÜV compliance prominence @ 390px dark', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.goto('/dev/service-info-v3');
    const tuv = page.getByTestId('fixture-modal-arteon').getByTestId('compliance-tuv');
    await expect(tuv).toContainText('Nicht vermieten');
    await page.screenshot({
      path: join(artifactDir, 'modal-compliance-blocking-dark-390.png'),
      fullPage: true,
    });
    await context.close();
  });

  test('Mercedes history-rich scenario regression', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const mercedes = page.getByTestId('fixture-mercedes');
    await expect(mercedes.getByTestId('service-history-timeline')).toBeVisible();
    await mercedes.screenshot({ path: join(artifactDir, 'mercedes-history-ux3-390.png') });
  });

  test('Arteon Wartungsplan overdue advisory', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dev/service-info-v3');
    const arteon = page.getByTestId('fixture-arteon');
    await arteon.getByRole('tab', { name: 'Wartungsplan' }).click();
    await expect(arteon.getByRole('heading', { name: /Überfällig/i }).first()).toBeVisible();
    await arteon.screenshot({ path: join(artifactDir, 'arteon-plan-overdue-1440.png') });
  });
});
