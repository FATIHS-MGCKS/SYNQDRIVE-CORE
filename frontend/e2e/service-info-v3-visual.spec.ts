import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const artifactDir = '/opt/cursor/artifacts/service-info-v3-ux11';

const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
] as const;

test.describe('Service Info V3 UX-1.1 visual fixture', () => {
  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  for (const vp of viewports) {
    test(`Arteon fixture light @ ${vp.name}px`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('synqdrive.locale', 'de');
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dev/service-info-v3');
      const target = page.getByTestId('fixture-arteon');
      await expect(target).toBeVisible();
      await expect(page.getByText('Hervorgehoben in der Übersicht').first()).toBeVisible();
      const overflow = await target.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(overflow).toBe(false);
      await page.screenshot({
        path: join(artifactDir, `arteon-light-${vp.name}.png`),
        fullPage: true,
      });
    });
  }

  test('Arteon fixture dark @ 390px', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'dark',
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.goto('/dev/service-info-v3');
    await expect(page.getByTestId('fixture-arteon')).toBeVisible();
    await page.screenshot({
      path: join(artifactDir, 'arteon-dark-390.png'),
      fullPage: true,
    });
    await context.close();
  });

  test('Not computable group collapsed by default', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('synqdrive.locale', 'de');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/service-info-v3');
    const arteon = page.getByTestId('fixture-arteon');
    const groupDetails = arteon.locator('[data-service-plan-group="notComputable"]');
    await expect(groupDetails).toHaveCount(1);
    await expect(groupDetails.locator(':scope > summary')).toContainText('Nicht berechenbar');
    expect(await groupDetails.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  });
});
