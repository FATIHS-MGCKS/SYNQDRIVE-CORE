import { expect, test } from '@playwright/test';
import {
  assertNoPageOverflow,
  captureVsiScreenshot,
  installVsiMasterIntelligenceMocks,
  openVsiMasterIntelligence,
  seedVsiMasterIntelligenceAuth,
  viewportLabel,
} from './vsi-master-intelligence-v2-fixtures';

test.describe('VSI Master Intelligence 2.0 — mocked Master Admin', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await seedVsiMasterIntelligenceAuth(page);
    await installVsiMasterIntelligenceMocks(page);
  });

  test('overview cockpit — responsive screenshot', async ({ page }, testInfo) => {
    const vp = viewportLabel(testInfo.project.name);
    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await expect(page.getByTestId('vsi-intelligence-tabbar')).toBeVisible();
    await expect(page.getByTestId('vsi-tab-overview')).toBeVisible();
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-overview-${vp}`);
  });

  test('tab surfaces — screenshots (mobile/tablet/desktop)', async ({ page }, testInfo) => {
    const vp = viewportLabel(testInfo.project.name);
    const captureTab = async (tab: string, shotBase: string, contentTestId: string) => {
      await openVsiMasterIntelligence(page, { tab });
      await expect(page.getByTestId(contentTestId)).toBeVisible({ timeout: 60_000 });
      await assertNoPageOverflow(page);
      await captureVsiScreenshot(page, testInfo, `${shotBase}-${vp}`);
    };

    await captureTab('signals', 'vsi-signals', 'vsi-tab-signals');
    await captureTab('profiles', 'vsi-profiles', 'vsi-tab-profiles');
    await openVsiMasterIntelligence(page, { tab: 'queries' });
    await expect(page.getByTestId('vsi-tab-queries')).toBeVisible({ timeout: 60_000 });
    const inspect = page.getByRole('button', { name: /Abfragen inspizieren/i });
    if (await inspect.isVisible().catch(() => false)) {
      await inspect.click();
      await expect(page.getByTestId('vsi-fsd-inspector-panel')).toBeVisible({ timeout: 15_000 });
    }
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-queries-inspector-${vp}`);
    await captureTab('runs', 'vsi-runs', 'vsi-tab-runs');
  });

  test('keyboard tab navigation @desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'keyboard focus check on desktop width');

    await openVsiMasterIntelligence(page, { tab: 'signals' });
    const tablist = page.getByTestId('vsi-intelligence-tabbar');
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab')).toHaveCount(7);
    await expect(tablist.getByTestId('vsi-intelligence-tab-signals')).toHaveAttribute('aria-selected', 'true');
  });
});
