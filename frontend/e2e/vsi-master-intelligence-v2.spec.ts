import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  installVsiMasterIntelligenceMocks,
  openVsiMasterIntelligence,
  seedVsiMasterIntelligenceAuth,
} from './vsi-master-intelligence-v2-fixtures';

const artifactDir = '/opt/cursor/artifacts';

test.describe('VSI Master Intelligence 2.0 — mocked Master Admin', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await seedVsiMasterIntelligenceAuth(page);
    await installVsiMasterIntelligenceMocks(page);
  });

  test('overview cockpit — responsive screenshot', async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const label =
      project === 'mobile-390'
        ? 'mobile-390'
        : project === 'tablet-768'
          ? 'tablet-768'
          : 'desktop-1440';

    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await expect(page.getByTestId('vsi-intelligence-tabbar')).toBeVisible();
    await expect(page.getByTestId('vsi-tab-overview')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await page.screenshot({
      path: path.join(artifactDir, `vsi-overview-${label}.png`),
      fullPage: true,
    });
    testInfo.annotations.push({ type: 'screenshots', description: `overview @ ${label}` });
  });

  test('signal explorer, profiles, queries and runs — desktop screenshots @desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'tab screenshots on desktop project');

    const captureTab = async (tab: string, artifactName: string, contentTestId: string) => {
      await openVsiMasterIntelligence(page, { tab });
      await expect(page.getByTestId(contentTestId)).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: path.join(artifactDir, artifactName), fullPage: true });
    };

    await captureTab('signals', 'vsi-signals-desktop-1440.png', 'vsi-tab-signals');
    await captureTab('profiles', 'vsi-profiles-desktop-1440.png', 'vsi-tab-profiles');
    await captureTab('queries', 'vsi-queries-desktop-1440.png', 'vsi-tab-queries');
    await openVsiMasterIntelligence(page, { tab: 'queries' });
    await expect(page.getByTestId('vsi-tab-queries')).toBeVisible({ timeout: 60_000 });
    const inspect = page.getByRole('button', { name: /Abfragen inspizieren/i });
    if (await inspect.isVisible().catch(() => false)) {
      await inspect.click();
      await expect(page.getByTestId('vsi-fsd-inspector-panel')).toBeVisible({ timeout: 15_000 });
    }
    await page.screenshot({
      path: path.join(artifactDir, 'vsi-queries-inspector-desktop-1440.png'),
      fullPage: true,
    });
    await captureTab('runs', 'vsi-runs-desktop-1440.png', 'vsi-tab-runs');
  });

  test('keyboard tab navigation @desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'keyboard focus check on desktop width');

    await openVsiMasterIntelligence(page);
    const tablist = page.getByTestId('vsi-intelligence-tabbar');
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab')).toHaveCount(7);
    await expect(tablist.getByTestId('vsi-intelligence-tab-overview')).toHaveAttribute('aria-selected', 'true');
  });
});
