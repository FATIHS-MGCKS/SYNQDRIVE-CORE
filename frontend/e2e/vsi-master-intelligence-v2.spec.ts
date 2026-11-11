import { expect, test } from '@playwright/test';
import {
  assertNoPageOverflow,
  bundleVsiScreenshotArtifactsZip,
  captureVsiScreenshot,
  installVsiMasterIntelligenceMocks,
  openVsiMasterIntelligence,
  seedVsiMasterIntelligenceAuth,
  viewportLabel,
  waitForVsiProfileLabels,
} from './vsi-master-intelligence-v2-fixtures';

test.describe('VSI Master Intelligence 2.0 — mocked Master Admin', () => {
  test.describe.configure({ retries: 0 });
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await seedVsiMasterIntelligenceAuth(page);
    await installVsiMasterIntelligenceMocks(page);
  });

  test.afterAll(() => {
    bundleVsiScreenshotArtifactsZip();
  });

  test('overview cockpit — responsive screenshot', async ({ page }, testInfo) => {
    const vp = viewportLabel(testInfo.project.name);
    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiProfileLabels(page);
    await expect(page.getByTestId('vsi-tab-overview')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/LV ~8h beobachtet/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Autoritativer Live-Katalog/i)).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-overview-${vp}`);
  });

  test('tab surfaces — screenshots (mobile/tablet/desktop)', async ({ page }, testInfo) => {
    const vp = viewportLabel(testInfo.project.name);

    await openVsiMasterIntelligence(page, { tab: 'signals' });
    await expect(page.getByTestId('vsi-tab-signals')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('cell', { name: 'speed' })).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-signals-${vp}`);

    await openVsiMasterIntelligence(page, { tab: 'profiles' });
    await waitForVsiProfileLabels(page);
    await expect(page.getByTestId('vsi-tab-profiles')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/LV ~8h beobachtet/i)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/RPM hochfrequent|RPM_1HZ/i)).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-profiles-${vp}`);

    await openVsiMasterIntelligence(page, { tab: 'queries' });
    await expect(page.getByTestId('vsi-tab-queries')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('run-e2e-1')).toBeVisible({ timeout: 60_000 });
    const inspect = page.getByRole('button', { name: /Abfragen inspizieren/i });
    await expect(inspect).toBeVisible({ timeout: 15_000 });
    await inspect.click();
    await expect(page.getByTestId('vsi-fsd-inspector-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('fp-1')).toBeVisible();
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-queries-inspector-${vp}`);

    await openVsiMasterIntelligence(page, { tab: 'runs' });
    await expect(page.getByTestId('vsi-tab-runs')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('run-e2e-1')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/LV_8H_OBSERVED/)).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-runs-${vp}`);
  });

  test('keyboard tab navigation @desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'keyboard focus check on desktop width');

    await openVsiMasterIntelligence(page, { tab: 'signals' });
    const tablist = page.getByTestId('vsi-intelligence-tabbar');
    await expect(tablist).toBeVisible();
    await expect(page.getByRole('cell', { name: 'speed' })).toBeVisible({ timeout: 60_000 });
    await expect(tablist.getByRole('tab')).toHaveCount(7);
    await expect(tablist.getByTestId('vsi-intelligence-tab-signals')).toHaveAttribute('aria-selected', 'true');
  });
});
