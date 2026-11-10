import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir = '/opt/cursor/artifacts/service-info-v3-ux32-overdue';

const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

test.describe('Service Info V3 UX-3.2 overdue clarity', () => {
  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  for (const vp of viewports) {
    test(`UX-32 fixture overview + plan light @ ${vp.name}px`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('synqdrive.locale', 'de');
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dev/service-info-v3');
      const fixture = page.getByTestId('fixture-ux32-iphone');
      await expect(fixture).toBeVisible();

      const overdueBlock = fixture.getByTestId('service-info-overdue-overview');
      await expect(overdueBlock.getByText('3 Wartungen überfällig')).toBeVisible();
      await expect(fixture.getByTestId('service-overdue-item-p-brake-fluid')).toContainText('Bremsflüssigkeit');
      await expect(fixture.getByTestId('service-overdue-item-p-brake-fluid')).toContainText('963');
      await expect(fixture.getByText('11 weitere Positionen nicht berechenbar')).toBeVisible();

      const overflowOverview = await fixture.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflowOverview).toBe(false);

      await fixture.getByRole('tab', { name: 'Wartungsplan' }).click();
      const oil = fixture.locator('[data-testid="service-plan-position-p-oil"]');
      await expect(oil).toContainText('Zuletzt nachgewiesen');
      await expect(oil).toContainText('170.430');
      await expect(oil).not.toContainText('Details');
      const md = fixture.locator('[data-testid="service-plan-position-p-md-only"]');
      await expect(md).toContainText('Berechnungsgrundlage');

      const overflowPlan = await fixture.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflowPlan).toBe(false);

      await page.screenshot({
        path: join(artifactDir, `ux32-plan-light-${vp.name}.png`),
        fullPage: true,
      });
    });
  }

  test('open plan from overview action navigates to Wartungsplan tab @ 390px', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const fixture = page.getByTestId('fixture-ux32-iphone');
    const openPlan = fixture.getByRole('button', { name: /Alle im Wartungsplan anzeigen/i });
    await expect(openPlan).toBeVisible();
    await openPlan.click();
    await expect(fixture.getByRole('tab', { name: 'Wartungsplan' })).toHaveAttribute('aria-selected', 'true');
  });

  test('UX-32 fixture dark @ 390px', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.goto('/dev/service-info-v3');
    const fixture = page.getByTestId('fixture-ux32-iphone');
    await expect(fixture.getByText('3 Wartungen überfällig')).toBeVisible();
    await fixture.getByRole('tab', { name: 'Wartungsplan' }).click();
    await page.screenshot({
      path: join(artifactDir, 'ux32-plan-dark-390.png'),
      fullPage: true,
    });
    await context.close();
  });
});
