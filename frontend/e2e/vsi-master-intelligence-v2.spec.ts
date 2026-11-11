import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  assertNoPageOverflow,
  bundleVsiScreenshotArtifactsZip,
  captureVsiScreenshot,
  goToVsiSignalsTab,
  installVsiMasterIntelligenceMocks,
  openVsiMasterIntelligence,
  seedVsiMasterIntelligenceAuth,
  viewportLabel,
  waitForVsiProfileLabels,
  waitForVsiProfilesTab,
  waitForVsiScopeSettled,
} from './vsi-master-intelligence-v2-fixtures';

const MANDATORY_VIEWPORTS = new Set(['mobile-390', 'tablet-768', 'desktop-1440']);

function isMandatoryViewport(projectName: string): boolean {
  return MANDATORY_VIEWPORTS.has(projectName);
}

test.describe('VSI Master Intelligence 2.0 — mocked Master Admin', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await seedVsiMasterIntelligenceAuth(page);
    await installVsiMasterIntelligenceMocks(page);
  });

  test.afterAll(() => {
    bundleVsiScreenshotArtifactsZip(process.env.GITHUB_SHA ?? process.env.VSI_E2E_COMMIT_SHA ?? 'local-dev');
  });

  test('overview cockpit — responsive screenshot', async ({ page }, testInfo) => {
    test.skip(!isMandatoryViewport(testInfo.project.name), 'mandatory viewport screenshot matrix');
    const vp = viewportLabel(testInfo.project.name);
    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiProfileLabels(page);
    await expect(page.getByTestId('vsi-tab-overview')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/LV ~8h beobachtet|LV_8H_OBSERVED/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Autoritativer Live-Katalog/i)).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-overview-${vp}`);
  });

  test('tab surfaces — screenshots (mobile/tablet/desktop)', async ({ page }, testInfo) => {
    test.skip(!isMandatoryViewport(testInfo.project.name), 'mandatory viewport screenshot matrix');
    const vp = viewportLabel(testInfo.project.name);

    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiProfileLabels(page);
    await goToVsiSignalsTab(page);
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-signals-${vp}`);

    await page.getByTestId('vsi-intelligence-tab-profiles').click();
    await waitForVsiProfilesTab(page);
    await expect(page.getByTestId('vsi-tab-profiles')).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-profiles-${vp}`);

    await page.getByTestId('vsi-intelligence-tab-queries').click();
    await expect(page.getByTestId('vsi-tab-queries')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('run-e2e-1')).toBeVisible({ timeout: 60_000 });
    const inspect = page.getByRole('button', { name: /Abfragen inspizieren/i });
    await expect(inspect).toBeVisible({ timeout: 15_000 });
    await inspect.click();
    await expect(page.getByTestId('vsi-fsd-inspector-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('fp-1')).toBeVisible();
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-queries-inspector-${vp}`);

    await page.getByTestId('vsi-intelligence-tab-runs').click();
    await expect(page.getByTestId('vsi-tab-runs')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('vsi-tab-runs').getByText('run-e2e-1').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('vsi-tab-runs').getByText(/LV_8H_OBSERVED/)).toBeVisible({ timeout: 60_000 });
    await assertNoPageOverflow(page);
    await captureVsiScreenshot(page, testInfo, `vsi-runs-${vp}`);
  });

  test('signal detail drawer — keyboard focus and escape', async ({ page }, testInfo) => {
    test.skip(!isMandatoryViewport(testInfo.project.name), 'drawer keyboard on mandatory viewports');

    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiProfileLabels(page);
    await goToVsiSignalsTab(page);

    const openBtn = page.getByTestId('vsi-fsd-signal-detail-open-speed');
    await openBtn.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByTestId('vsi-fsd-signal-detail-sheet');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole('heading', { name: 'speed' })).toBeVisible();

    if (testInfo.project.name === 'desktop-1440' || testInfo.project.name === 'mobile-390') {
      await assertNoPageOverflow(page);
      const vp = viewportLabel(testInfo.project.name);
      await captureVsiScreenshot(page, testInfo, `vsi-signal-drawer-${vp}`);
    }

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await expect(openBtn).toBeFocused();

    await openBtn.focus();
    await page.keyboard.press('Enter');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(openBtn).toBeFocused();
  });

  test('tablist ArrowRight Home End keyboard navigation', async ({ page }) => {
    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiScopeSettled(page);
    const tablist = page.getByTestId('vsi-intelligence-tabbar');
    await expect(tablist).toBeVisible({ timeout: 30_000 });

    const overviewTab = page.getByTestId('vsi-intelligence-tab-overview');
    const signalsTab = page.getByTestId('vsi-intelligence-tab-signals');
    await overviewTab.focus();

    await page.keyboard.press('ArrowRight');
    await expect(signalsTab).toBeFocused();
    await expect(signalsTab).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Home');
    await expect(overviewTab).toBeFocused();
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('vsi-tab-overview')).toBeVisible({ timeout: 30_000 });

    const ledgerTab = page.getByTestId('vsi-intelligence-tab-ledger');
    await page.keyboard.press('End');
    await expect(ledgerTab).toBeFocused();
  });

  test('search Enter and inspector keyboard', async ({ page }) => {
    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiProfileLabels(page);
    await goToVsiSignalsTab(page);

    const search = page.getByRole('textbox', { name: /Provider-native Signale suchen|Search provider-native signals/i });
    await search.fill('speed');
    await search.press('Enter');
    await expect(page.getByTestId('vsi-fsd-signal-detail-open-speed')).toBeVisible();

    await page.getByTestId('vsi-intelligence-tab-queries').click();
    await expect(page.getByText('run-e2e-1')).toBeVisible({ timeout: 60_000 });
    const runInspect = page.getByRole('button', { name: /Abfragen inspizieren|Inspect run queries/i }).first();
    await runInspect.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vsi-fsd-inspector-panel')).toBeVisible({ timeout: 15_000 });
  });

  test('axe — critical/serious violations (signals tab)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1440', 'axe baseline on desktop width');
    await openVsiMasterIntelligence(page, { tab: 'overview' });
    await waitForVsiProfileLabels(page);
    await goToVsiSignalsTab(page);

    const results = await new AxeBuilder({ page })
      .include('[data-testid="vsi-tab-signals"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
