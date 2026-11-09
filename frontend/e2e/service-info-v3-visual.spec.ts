import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir = '/opt/cursor/artifacts/service-info-v3-ux2';

const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

test.describe('Service Info V3 UX-2 visual fixture', () => {
  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  for (const vp of viewports) {
    test(`Arteon overview light @ ${vp.name}px`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('synqdrive.locale', 'de');
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dev/service-info-v3');
      const target = page.getByTestId('fixture-arteon');
      await expect(target).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Übersicht' }).first()).toBeVisible();
      const overflow = await target.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      await page.screenshot({
        path: join(artifactDir, `arteon-overview-light-${vp.name}.png`),
        fullPage: true,
      });
    });
  }

  test('Arteon history tab dark @ 390px', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.goto('/dev/service-info-v3');
    const arteon = page.getByTestId('fixture-arteon');
    await arteon.getByRole('tab', { name: 'Servicehistorie' }).click();
    await expect(arteon.getByTestId('service-history-timeline')).toBeVisible();
    await page.screenshot({
      path: join(artifactDir, 'arteon-history-dark-390.png'),
      fullPage: true,
    });
    await context.close();
  });

  test('Mercedes history same-day rows + year grouping', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const mercedes = page.getByTestId('fixture-mercedes');
    await expect(mercedes.getByTestId('service-history-timeline')).toBeVisible();
    await expect(mercedes.getByText('2025').first()).toBeVisible();
    await expect(mercedes.locator('[data-service-history-id="mh-2025-full"]')).toBeVisible();
    await expect(mercedes.locator('[data-service-history-id="mh-2025-same-day"]')).toBeVisible();
    await page.screenshot({
      path: join(artifactDir, 'mercedes-history-390.png'),
      fullPage: true,
    });
  });

  test('Not computable group collapsed on Wartungsplan tab', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const arteon = page.getByTestId('fixture-arteon');
    await arteon.getByRole('tab', { name: 'Wartungsplan' }).click();
    const groupDetails = arteon.locator('[data-service-plan-group="notComputable"]');
    await expect(groupDetails).toHaveCount(1);
    await expect(groupDetails.locator(':scope > summary')).toContainText('Nicht berechenbar');
    expect(await groupDetails.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  });

  test('History row keyboard expand', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const mercedes = page.getByTestId('fixture-mercedes');
    const row = mercedes.locator('[data-service-history-id="mh-2025-full"]');
    await row.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(row.locator('[id$="-detail"]').first()).toBeVisible();
  });
});
