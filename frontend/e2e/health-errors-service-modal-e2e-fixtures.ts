import { expect, type Page, type Route } from '@playwright/test';

export const SVC_MODAL_ORG_ID = 'org-svc-modal-e2e';
export const SVC_MODAL_VEHICLE_ID = 'veh-svc-e2e-arteon';

const API_PATTERN = '**/api/v1/**';

export const svcModalMockUser = {
  id: 'user-svc-modal-e2e',
  email: 'svc-modal@synqdrive.eu',
  name: 'Service Modal E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: SVC_MODAL_ORG_ID,
  organizationName: 'Service Modal E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
    documents: { read: true, write: true, manage: true },
  },
};

/** Inline mock payload (Playwright-safe; mirrors `arteonFixtureModalPresentation`). */
const serviceInfoPayload = {
  hasServiceHistory: true,
  hasServiceBaseline: true,
  tuvValidTill: '2025-08-01T00:00:00.000Z',
  tuvRemainingDays: -12,
  tuvOverdue: true,
  bokraftValidTill: '2027-04-15T00:00:00.000Z',
  bokraftRemainingDays: 120,
  bokraftOverdue: false,
  serviceHistory: [
    {
      id: 'art-2026',
      eventType: 'OIL_CHANGE',
      date: '2026-01-10T08:00:00.000Z',
      odometerKm: 47000,
      workshopName: 'VW Zentrum',
      origin: 'ONEAUTO',
      externalSource: true,
    },
  ],
  maintenanceForecast: {
    computedAt: '2026-01-15T10:00:00.000Z',
    scheduleSources: ['ONEAUTO_SCHEDULE'],
    positions: [
      {
        positionId: 'p-inspection-headline',
        kind: 'INSPECTION',
        label: 'Hauptinspektion',
        dueState: 'OVERDUE',
        intervalMode: 'RECURRING',
        remainingKm: -800,
        remainingDays: -21,
        provenance: {
          scheduleSource: 'ONEAUTO_SCHEDULE',
          eventSource: 'SERVICE_EVENT_ONEAUTO',
          odometerSource: 'VEHICLE_LATEST_STATE',
          calculationMethod: 'COMPUTED_FROM_SCHEDULE_AND_HISTORY',
        },
        dataQuality: [],
      },
    ],
    unscheduledPositions: [],
    odometer: { km: 48200, source: 'VEHICLE_LATEST_STATE' },
  },
  nextService: { trackingStatus: 'TRACKED', overdue: true, remainingDays: -21 },
};

function json(data: unknown) {
  return JSON.stringify(data);
}

let routeHandler: ((route: Route) => Promise<void>) | null = null;

export async function installHealthErrorsServiceModalMocks(page: Page) {
  await page.addInitScript(
    ({ user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', 'svc-modal-e2e-token');
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    { user: svcModalMockUser, locale: 'de', theme: undefined as string | undefined },
  );

  const context = page.context();
  if (routeHandler) {
    await context.unroute(API_PATTERN, routeHandler);
  }

  routeHandler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(svcModalMockUser) });
    }

    if (url.includes('/auth/memberships') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ organizations: [{ id: SVC_MODAL_ORG_ID, name: svcModalMockUser.organizationName }] }),
      });
    }

    if (url.includes(`/organizations/${SVC_MODAL_ORG_ID}`) && url.includes('/profile') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          id: SVC_MODAL_ORG_ID,
          name: svcModalMockUser.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
        }),
      });
    }

    if (url.includes('/fleet-map') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
    }

    if (url.includes('/rental-health') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          vehicles: [
            {
              vehicle_id: SVC_MODAL_VEHICLE_ID,
              overall_state: 'watch',
              modules: {
                service_compliance: { state: 'watch', confidence: 'medium' },
              },
            },
          ],
        }),
      });
    }

    if (method === 'GET' && url.includes(`/vehicles/${SVC_MODAL_VEHICLE_ID}/`)) {
      if (url.includes('dtcActive')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
      }
      if (url.includes('dtcStats')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: json({ lastChecked: null }) });
      }
      if (url.includes('dtcSummary')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: json({ status: 'unavailable' }) });
      }
      if (url.includes('dtc/detail')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json({
            history: [],
            currentFaults: { status: 'no_faults', activeFaults: [] },
            monitoring: { lastSuccessfulCheckAt: null },
          }),
        });
      }
      if (url.includes('/dtc') && !url.includes('dtcDetail')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: json([]) });
      }
      if (url.includes('ai-health-care')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json({ indicators: {}, dashboardWarningLights: { lights: [] } }),
        });
      }
      if (url.includes('brake') || url.includes('tire') || url.includes('battery') || url.includes('trip')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: json({}) });
      }
    }

    if (url.includes('dashboard-warning-lights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ lights: [], freshness: 'no_data', lastObservedAt: null }),
      });
    }

    if (url.includes('/health-tab-summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ sourceStatus: { highMobility: 'no_data' }, moduleStates: null }),
      });
    }

    if (url.includes('/service-info-status') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json(serviceInfoPayload),
      });
    }

    if (url.includes('/service-history-page') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          items: serviceInfoPayload.serviceHistory ?? [],
          nextCursor: null,
          hasMore: false,
          totalCount: serviceInfoPayload.serviceHistory?.length ?? 0,
        }),
      });
    }

    if (method === 'GET' && url.includes(`/organizations/${SVC_MODAL_ORG_ID}/tasks`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ data: [], nextCursor: null, hasMore: false }),
      });
    }

    if (url.includes(`/organizations/${SVC_MODAL_ORG_ID}/vehicles`) && method === 'GET') {
      if (url.includes(`/vehicles/${SVC_MODAL_VEHICLE_ID}`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json({
            id: SVC_MODAL_VEHICLE_ID,
            licensePlate: 'SVC-E2E',
            make: 'VW',
            model: 'Arteon',
            year: 2022,
            fuelType: 'Gasoline',
            organizationId: SVC_MODAL_ORG_ID,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [
            {
              id: SVC_MODAL_VEHICLE_ID,
              vehicleName: 'VW Arteon E2E',
              licensePlate: 'SVC-E2E',
              organizationId: SVC_MODAL_ORG_ID,
            },
          ],
          meta: { total: 1 },
        }),
      });
    }

    if (method === 'GET' && url.includes('/vehicles') && !url.includes('vehicle-intelligence')) {
      if (url.endsWith(`/vehicles/${SVC_MODAL_VEHICLE_ID}`) || url.includes(`/vehicles/${SVC_MODAL_VEHICLE_ID}?`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json({
            id: SVC_MODAL_VEHICLE_ID,
            licensePlate: 'SVC-E2E',
            make: 'VW',
            model: 'Arteon',
            year: 2022,
            fuelType: 'Gasoline',
            organizationId: SVC_MODAL_ORG_ID,
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [
            {
              id: SVC_MODAL_VEHICLE_ID,
              vehicleName: 'VW Arteon E2E',
              licensePlate: 'SVC-E2E',
              organizationId: SVC_MODAL_ORG_ID,
            },
          ],
        }),
      });
    }

    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json(null),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  };

  await context.route(API_PATTERN, routeHandler);
}

export async function openHealthErrorsServiceModalHarness(
  page: Page,
  options?: { theme?: 'light' | 'dark'; locale?: string },
) {
  if (options?.theme) {
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('synqdrive-theme-preference', theme);
    }, { theme: options.theme });
  }
  if (options?.locale) {
    await page.addInitScript(({ locale }) => {
      localStorage.setItem('synqdrive.locale', locale);
    }, { locale: options.locale });
  }

  await installHealthErrorsServiceModalMocks(page);
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://127.0.0.1:5173';
  await page.goto(`${baseUrl}/dev/health-errors-service-modal`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('health-errors-service-e2e-root')).toBeVisible({ timeout: 60_000 });
  const modal = page.getByTestId('service-info-v3-modal');
  if ((await modal.count()) === 0) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('synqdrive-dev-open-service-modal'));
    });
  }
  await expect(modal).toBeVisible({ timeout: 30_000 });
  return modal;
}

export function serviceModalRoot(page: Page) {
  return page.getByTestId('service-info-v3-modal');
}
