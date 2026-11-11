import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page, Route, TestInfo } from '@playwright/test';

export const VSI_E2E_ORG = '00000000-0000-4000-8000-0000000000e2';
export const VSI_E2E_VEHICLE = '00000000-0000-4000-8000-0000000000f2';
export const VSI_E2E_LINK = '00000000-0000-4000-8000-0000000000e3';

const mockMasterAdmin = {
  id: 'user-vsi-e2e-master',
  email: 'vsi-e2e@synqdrive.eu',
  name: 'VSI E2E Master',
  platformRole: 'MASTER_ADMIN',
  membershipRole: 'MASTER_ADMIN',
  organizationId: null,
  organizationName: null,
  organizationLogoUrl: null,
  permissions: {},
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const VSI_MOCKS_INSTALLED = Symbol('vsiMasterIntelligenceMocksInstalled');

export async function installVsiMasterIntelligenceMocks(page: Page) {
  if ((page as unknown as Record<symbol, boolean>)[VSI_MOCKS_INSTALLED]) {
    return;
  }
  (page as unknown as Record<symbol, boolean>)[VSI_MOCKS_INSTALLED] = true;

  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (!method || method === 'OPTIONS') return route.continue();

    if (url.includes('/auth/me')) {
      return json(route, mockMasterAdmin);
    }

    if (url.includes('/account/mfa/status')) {
      return json(route, {
        enrolled: true,
        factorTypes: ['totp'],
        recoveryCodesRemaining: 8,
        privilegedAccount: true,
        enrollmentRequired: false,
        stepUpEnforced: false,
      });
    }

    if (url.includes(`/organizations/${VSI_E2E_ORG}/vehicles`)) {
      return json(route, {
        data: [
          {
            id: VSI_E2E_VEHICLE,
            make: 'VW',
            model: 'Tiguan',
            licensePlate: 'VSI-E2E',
          },
        ],
        meta: { total: 1 },
      });
    }

    if (url.includes('/admin/users') && method === 'GET') {
      return json(route, []);
    }

    if (url.includes('/admin/organizations/operational') && method === 'GET') {
      return json(route, {
        data: [{ id: VSI_E2E_ORG, companyName: 'VSI E2E Org' }],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });
    }

    if (url.includes('/admin/organizations') && method === 'GET') {
      return json(route, { data: [{ id: VSI_E2E_ORG, companyName: 'VSI E2E Org' }], meta: { total: 1 } });
    }

    if (url.includes('/master-intelligence/vsi/') && url.includes('/overview')) {
      return json(route, {
        organizationId: VSI_E2E_ORG,
        vehicleId: VSI_E2E_VEHICLE,
        profiles: [
          {
            providerSourceLinkId: VSI_E2E_LINK,
            providerIdentity: 'dimo:e2e',
            provider: 'DIMO',
            profileRevision: 3,
            profileContractVersion: 'v2',
            evaluatedAt: '2026-11-01T10:00:00.000Z',
            lastMaterializedSourceTimestamp: null,
            lastMaterializedProviderFetchAt: null,
            profileLimitations: [],
            lvStandbyProfile: 'LV_8H_OBSERVED',
            lvClassificationDecisionCode: null,
            lvEvidenceConfidence: 'HIGH',
            rpmActiveProfile: 'RPM_1HZ',
            rpmApplicability: 'APPLICABLE',
            rpmClassificationDecisionCode: null,
            observedDensityLabel: 'SUB_ONE_HZ',
            evaluationBlocked: false,
            evaluationBlockedCodes: [],
          },
        ],
      });
    }

    if (url.includes('/capability-resolver')) {
      return json(route, {
        consumerModule: 'apds',
        featureId: 'shadow_demand_profile_read',
        decision: 'ALLOW',
        limitations: [],
      });
    }

    if (
      url.includes('/master-intelligence/vsi/') &&
      url.includes('/links/') &&
      url.includes('/signals') &&
      !url.includes('/fsd/')
    ) {
      return json(route, { items: [] });
    }

    if (
      url.includes('/master-intelligence/vsi/') &&
      url.includes('/links/') &&
      url.includes('/profile') &&
      !url.includes('/fsd/')
    ) {
      return json(route, {
        providerSourceLinkId: VSI_E2E_LINK,
        providerIdentity: 'dimo:e2e',
        provider: 'DIMO',
        profileRevision: 3,
        profileContractVersion: 'v2',
        evaluatedAt: '2026-11-01T10:00:00.000Z',
        contentFingerprintPrefix: 'abc',
        signals: [
          {
            canonicalSignalKey: 'engine_rpm',
            providerNativeSignalName: 'speed',
            declaredSupport: 'OBSERVED',
            empiricalObservation: 'OBSERVED',
            qualityClassification: null,
            confidenceLevel: 'HIGH',
            lastValidObservationAt: null,
            lastSourceTimestamp: null,
            lastProviderFetchAt: null,
            freshnessClassification: 'UNKNOWN',
            evidenceProvenance: [],
            limitations: [],
            cadenceIntelligence: { regimes: ['RPM_1HZ'] },
          },
        ],
        fetchTimeIsNotNewSignalProof: true,
        lvStandbyProfile: 'LV_8H_OBSERVED',
        rpmActiveProfile: 'RPM_1HZ',
        rpmApplicability: 'APPLICABLE',
        profileLimitations: [],
        evaluationBlocked: false,
        evaluationBlockedCodes: [],
      });
    }

    if (url.includes('/fsd/summary')) {
      return json(route, {
        contractVersion: 'vsi-master-fsd-read-v1',
        organizationId: VSI_E2E_ORG,
        vehicleId: VSI_E2E_VEHICLE,
        providerSourceLinkId: VSI_E2E_LINK,
        catalog: {
          availability: 'AUTHORITATIVE_LIVE',
          provenanceClass: 'LIVE_DIMO_VERIFIED',
          declaredSignalCount: 2,
          authoritativeRunId: 'run-e2e-1',
          declaredCatalogFingerprint: null,
          rejectionReason: null,
          selectionLimitation: null,
        },
        execution: {
          fsd3: {
            discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
            state: 'COMPLETED',
            latestActivityRunId: null,
            latestRunId: 'run-e2e-1',
            lastCompletedAt: '2026-11-01T09:00:00.000Z',
          },
          fsd4: {
            discoveryStream: 'FSD4_HISTORICAL',
            state: 'NOT_YET_EXECUTED',
            latestRunId: null,
            lastCompletedAt: null,
            historicalCrossStreamLink: 'NOT_AVAILABLE',
          },
        },
        evidence: { snapshot: 'AVAILABLE', historical: 'NOT_EXECUTED', historicalCrossStreamLimitation: null },
        invalidation: { isInvalidated: false, invalidatedAt: null, supersededByRunId: null },
        vsiProfileCompositionHints: {
          organizationId: VSI_E2E_ORG,
          vehicleId: VSI_E2E_VEHICLE,
          providerSourceLinkId: VSI_E2E_LINK,
        },
      });
    }

    if (url.includes('/fsd/signals')) {
      return json(route, {
        contractVersion: 'vsi-master-fsd-read-v1',
        organizationId: VSI_E2E_ORG,
        vehicleId: VSI_E2E_VEHICLE,
        providerSourceLinkId: VSI_E2E_LINK,
        catalogRunId: 'run-e2e-1',
        catalogAuthoritative: true,
        historicalLink: 'NOT_AVAILABLE',
        items: [
          {
            providerNativeSignalName: 'speed',
            declaredByProvider: true,
            schemaShape: null,
            presentationState: 'OBSERVED',
            catalogDeclared: true,
            snapshotEvidence: 'OBSERVED',
            historicalEvidence: 'NOT_EXECUTED',
            catalogQuery: { queryPlanned: true, queryAccepted: true, observedValue: true },
            snapshotQuery: { queryPlanned: true, queryAccepted: true, observedValue: true },
            historicalQuery: null,
            coverageAggregate: null,
            sourceRunId: 'run-e2e-1',
            provenanceReference: 'e2e',
          },
        ],
        page: { limit: 50, nextCursor: null, hasMore: false },
        aggregates: { declaredSignalCount: 2, logicalSignalsReturned: 1 },
      });
    }

    if (url.includes('/fsd/runs') && !url.includes('/inspector')) {
      return json(route, {
        contractVersion: 'vsi-master-fsd-read-v1',
        organizationId: VSI_E2E_ORG,
        vehicleId: VSI_E2E_VEHICLE,
        providerSourceLinkId: VSI_E2E_LINK,
        items: [
          {
            runId: 'run-e2e-1',
            discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
            status: 'COMPLETED',
            providerSourceLinkId: VSI_E2E_LINK,
            createdAt: '2026-11-01T08:00:00.000Z',
            completedAt: '2026-11-01T09:00:00.000Z',
            invalidatedAt: null,
            supersededByRunId: null,
            stages: [{ stageType: 'CATALOG', status: 'COMPLETED' }],
            catalogSignalCount: 2,
            evidenceCounts: { snapshotRows: 1, historicalRows: 0 },
            ledgerSummary: {
              persistedAttemptCount: 2,
              budgetTotal: 2,
              outcomeCounts: { SUCCEEDED: 2 },
              note: 'e2e',
            },
            failureClass: null,
            diagnosticCodes: [],
          },
        ],
        page: { limit: 25, nextCursor: null, hasMore: false },
      });
    }

    if (url.includes('/fsd/runs/') && url.includes('/inspector')) {
      return json(route, {
        contractVersion: 'vsi-master-fsd-read-v1',
        organizationId: VSI_E2E_ORG,
        vehicleId: VSI_E2E_VEHICLE,
        providerSourceLinkId: VSI_E2E_LINK,
        runId: 'run-e2e-1',
        discoveryStream: 'FSD3_CATALOG_SNAPSHOT',
        status: 'COMPLETED',
        stages: [{ stageType: 'CATALOG', status: 'COMPLETED', version: 1, lastHttpStatus: 200 }],
        catalogProvenance: {
          class: 'LIVE_DIMO_VERIFIED',
          declaredSignalCount: 2,
          authoritative: true,
          rejectionReason: null,
        },
        ledger: {
          budgetTotal: 2,
          budgetByStage: { CATALOG: 2 },
          persistedAttemptCount: 2,
          deduplicatedAttemptKeys: 2,
          outcomeCounts: { SUCCEEDED: 2 },
          malformedCheckpointStages: [],
          reconciliationNote: 'e2e ledger',
          attempts: [
            {
              stageType: 'CATALOG',
              attemptKey: 'a1',
              queryFingerprint: 'fp-1',
              outcome: 'SUCCEEDED',
              reservedAt: '2026-11-01T08:00:01.000Z',
              finishedAt: '2026-11-01T08:00:02.000Z',
              httpStatus: 200,
              lifecycle: 'SETTLED_SUCCEEDED',
            },
          ],
        },
        evidenceCoverage: { snapshot: 'AVAILABLE', historical: 'NOT_EXECUTED', observationCounts: null },
        cadence: { nativePollingFrequencyProven: false, note: 'Not proven in e2e' },
        aggregationSemantics: {
          aggregated1sIsProvenNative1Hz: false,
          note: 'Aggregated buckets are not native 1 Hz',
        },
      });
    }

    if (url.includes('/revisions')) {
      return json(route, {
        captureStatus: 'CAPTURE_ENABLED',
        items: [{ profileRevision: 3, evaluatedAt: '2026-11-01T10:00:00.000Z', recordedAt: '2026-11-01T10:00:00.000Z', materializationTrigger: 'e2e', profileLimitations: [], lvStandbyProfile: 'LV_8H_OBSERVED', rpmActiveProfile: 'RPM_1HZ', contentFingerprintPrefix: 'abc' }],
        page: { limit: 20, nextCursor: null, hasMore: false },
      });
    }

    if (url.includes('/admin/dashboard')) {
      return json(route, { totalOrganizations: 1, activeOrganizations: 1, totalUsers: 1, totalVehicles: 1 });
    }

    if (url.includes('/health')) {
      return json(route, { ok: true });
    }

    return json(route, {});
  });
}

export function viewportLabel(projectName: string): string {
  if (projectName === 'mobile-390') return 'mobile-390';
  if (projectName === 'tablet-768') return 'tablet-768';
  return 'desktop-1440';
}

export async function waitForVsiProfileLabels(page: Page) {
  await page.getByText(/LV ~8h beobachtet/i).waitFor({ state: 'visible', timeout: 120_000 });
}

export async function waitForVsiDataSettled(page: Page) {
  const loading = page.getByText(/VSI-Lesemodelle werden geladen/i);
  const fsdLoading = page.getByText(/FSD-Read-Modell wird geladen/i);
  if (await loading.isVisible().catch(() => false)) {
    try {
      await loading.waitFor({ state: 'hidden', timeout: 45_000 });
    } catch {
      // Let per-test visibility assertions report the failure mode.
    }
  }
  if (await fsdLoading.isVisible().catch(() => false)) {
    try {
      await fsdLoading.waitFor({ state: 'hidden', timeout: 20_000 });
    } catch {
      // optional FSD stripe; downstream assertions gate screenshots.
    }
  }
}

export async function assertNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  if (overflow) throw new Error('Unexpected horizontal overflow on root layout');
}

export async function captureVsiScreenshot(page: Page, testInfo: TestInfo, artifactBaseName: string) {
  const safeName = `${artifactBaseName}-p${testInfo.parallelIndex}`;
  const primary = testInfo.outputPath(`${safeName}.png`);
  await page.screenshot({ path: primary, fullPage: true });
  const bundle = path.join('/opt/cursor/artifacts', `${safeName}.png`);
  await fs.mkdir(path.dirname(bundle), { recursive: true });
  await fs.copyFile(primary, bundle);
  await testInfo.attach(safeName, { path: bundle, contentType: 'image/png' });
}

export function bundleVsiScreenshotArtifactsZip() {
  const zipPath = '/opt/cursor/artifacts/vsi-p2395-screenshots.zip';
  try {
    execSync(`rm -f "${zipPath}" && zip -j -q "${zipPath}" /opt/cursor/artifacts/vsi-*.png`, {
      stdio: 'pipe',
    });
  } catch {
    // zip may fail when no PNGs yet; Playwright attach still holds per-test shots
  }
  return zipPath;
}

export async function seedVsiMasterIntelligenceAuth(page: Page) {
  await page.addInitScript(
    ({ token, user, locale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
    },
    { token: 'vsi-e2e-master-token', user: mockMasterAdmin, locale: 'de' },
  );
}

export async function openVsiMasterIntelligence(
  page: Page,
  params: { tab?: string; width?: number; height?: number } = {},
) {
  if (params.width && params.height) {
    await page.setViewportSize({ width: params.width, height: params.height });
  }
  const qs = new URLSearchParams({
    view: 'vsi-intelligence',
    orgId: VSI_E2E_ORG,
    vehicleId: VSI_E2E_VEHICLE,
    providerSourceLinkId: VSI_E2E_LINK,
  });
  if (params.tab) qs.set('tab', params.tab);

  const pendingSignals =
    params.tab === 'signals'
      ? page.waitForResponse(
          (res) => res.url().includes('/fsd/signals') && res.status() >= 200 && res.status() < 300,
          { timeout: 60_000 },
        )
      : null;

  const pendingOverview = page.waitForResponse(
    (res) => {
      try {
        return /\/admin\/master-intelligence\/vsi\/organizations\/[^/]+\/vehicles\/[^/]+\/overview$/.test(
          new URL(res.url()).pathname,
        );
      } catch {
        return false;
      }
    },
    { timeout: 90_000 },
  );

  const pendingProfile =
    params.tab === 'profiles'
      ? page.waitForResponse(
          (res) => res.url().includes('/links/') && res.url().includes('/profile') && !res.url().includes('/fsd'),
          { timeout: 90_000 },
        )
      : null;

  await page.goto(`/master?${qs.toString()}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('vsi-intelligence-tabbar').waitFor({ state: 'visible', timeout: 90_000 });
  await Promise.all(
    [pendingSignals, pendingOverview, pendingProfile].filter((p): p is Promise<unknown> => p != null),
  );
}
