// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { OneAutoServiceDialog } from './OneAutoServiceDialog';
import { ONEAUTO_MAX_POLL_ATTEMPTS, ONEAUTO_POLL_INTERVAL_MS } from './oneauto-ui.util';

const mockGetCatalog = vi.fn();
const mockQuote = vi.fn();
const mockExecute = vi.fn();
const mockGetJob = vi.fn();
const mockGetJobResult = vi.fn();

vi.mock('./oneauto-api.client', () => ({
  oneAutoMasterApi: {
    getCatalog: (...args: unknown[]) => mockGetCatalog(...args),
    quote: (...args: unknown[]) => mockQuote(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
    getJob: (...args: unknown[]) => mockGetJob(...args),
    getJobResult: (...args: unknown[]) => mockGetJobResult(...args),
  },
}));

vi.mock('../../components/mfa/MfaStepUpDialog', () => ({
  MfaStepUpDialog: (props: { open: boolean }) =>
    props.open ? createElement('div', { 'data-testid': 'mfa-step-up-stub' }) : null,
}));

const sixSkus = [
  'OE_SERVICE_HISTORY_EU',
  'OE_SERVICE_SCHEDULE',
  'OE_BUILD_DECODE',
  'OE_BUILD_SHEET_EU',
  'OE_VIN_LOOKUP_EU',
  'RECALL_CHECK',
];

function catalogEntry(sku: string, status: string, executable: boolean, price: number | null = null) {
  return {
    serviceSku: sku,
    displayName: sku,
    description: `${sku} desc`,
    providerPathTemplate: 'path',
    httpMethod: 'GET' as const,
    executionMode: 'SYNC' as const,
    requiredParameters: ['vin'] as const,
    indicativePriceMinor: price,
    currency: 'GBP',
    pricingSourceVersion: 'v1',
    availabilityStatus: status,
    resultHandling: 'EXTERNAL_STORE_ONLY' as const,
    contractGate: {
      serviceSku: sku,
      executable,
      reason: executable ? 'EXECUTABLE' : 'CONTRACT_UNVERIFIED',
      unverifiedFields: executable ? [] : ['endpoint'],
    },
    executable,
  };
}

function renderDialog(props: Partial<ComponentProps<typeof OneAutoServiceDialog>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    organizationId: 'org-a',
    organizationName: 'Org A',
    vehicleId: 'veh-1',
    vehicleLabel: 'VW Golf',
    vin: 'WVWZZZ3CZWE123456',
    ...props,
  };
  act(() => {
    root.render(
      createElement(LanguageProvider, {
        children: createElement(OneAutoServiceDialog, defaultProps),
      }),
    );
  });
  return { container, root, props: defaultProps, query: (sel: string) => document.querySelector(sel) };
}

describe('OneAutoServiceDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetCatalog.mockResolvedValue({
      services: sixSkus.map((sku) =>
        catalogEntry(sku, 'CONTRACT_UNVERIFIED', false),
      ),
      indicativePricingDisclaimer: 'indicative',
    });
    mockQuote.mockReset();
    mockExecute.mockReset();
    mockGetJob.mockReset();
    mockGetJobResult.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders six catalog services from backend', async () => {
    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    const list = query('[data-testid="oneauto-service-catalog"]');
    expect(list).toBeTruthy();
    for (const sku of sixSkus) {
      expect(query(`[data-testid="oneauto-service-${sku}"]`)).toBeTruthy();
    }
  });

  it('disables execution for CONTRACT_UNVERIFIED services', async () => {
    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    const btn = query(
      '[data-testid="oneauto-select-OE_BUILD_DECODE"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(query('[data-testid="oneauto-service-OE_BUILD_DECODE"]')?.getAttribute('data-executable')).toBe(
      'false',
    );
  });

  it('disables execution when provider disabled', async () => {
    mockGetCatalog.mockResolvedValue({
      services: [catalogEntry('OE_BUILD_DECODE', 'DISABLED_FLAG', false)],
      indicativePricingDisclaimer: 'indicative',
    });
    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    const btn = query(
      '[data-testid="oneauto-select-OE_BUILD_DECODE"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('requires quote and explicit confirmation before execute', async () => {
    mockGetCatalog.mockResolvedValue({
      services: [catalogEntry('OE_BUILD_DECODE', 'AVAILABLE', true, 199)],
      indicativePricingDisclaimer: 'indicative',
    });
    mockQuote.mockResolvedValue({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      serviceSku: 'OE_BUILD_DECODE',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      estimatedPriceMinor: 199,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      executionMode: 'SYNC',
      indicativeNotGuaranteed: true,
      quoteIssuedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
      contractGate: { serviceSku: 'OE_BUILD_DECODE', executable: true, reason: 'EXECUTABLE', unverifiedFields: [] },
    });
    mockExecute.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 'job-1',
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        vinSnapshot: 'WVWZZZ3CZWE123456',
        serviceSku: 'OE_BUILD_DECODE',
        status: 'SUCCEEDED',
        idempotencyKey: 'key-1',
        providerRequestId: null,
        estimatedPriceMinor: 199,
        confirmedPriceMinor: 199,
        currency: 'GBP',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date().toISOString(),
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 0,
        lastErrorCode: null,
        initialProviderDispatchAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mockGetJob.mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      status: 'SUCCEEDED',
      serviceSku: 'OE_BUILD_DECODE',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      idempotencyKey: 'key-1',
      providerRequestId: 'req-1',
      estimatedPriceMinor: 199,
      confirmedPriceMinor: 199,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      costConfirmedAt: new Date().toISOString(),
      actualChargeMinor: null,
      actualChargeKnown: false,
      pollAttemptCount: 1,
      lastErrorCode: null,
      initialProviderDispatchAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockGetJobResult.mockResolvedValue({
      job: {
        id: 'job-1',
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        status: 'SUCCEEDED',
        serviceSku: 'OE_BUILD_DECODE',
        vinSnapshot: 'WVWZZZ3CZWE123456',
        idempotencyKey: 'key-1',
        providerRequestId: 'req-1',
        estimatedPriceMinor: 199,
        confirmedPriceMinor: 199,
        currency: 'GBP',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date().toISOString(),
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 1,
        lastErrorCode: null,
        initialProviderDispatchAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      latestResponse: {
        httpStatus: 200,
        providerStatusHeader: null,
        responseBodyJson: { ok: true },
        fetchedAt: new Date().toISOString(),
      },
      actualChargeKnown: false,
      actualChargeMinor: null,
    });

    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });

    const selectBtn = query(
      '[data-testid="oneauto-select-OE_BUILD_DECODE"]',
    ) as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
      await Promise.resolve();
    });

    expect(query('[data-testid="oneauto-quote-panel"]')).toBeTruthy();
    expect(mockQuote).toHaveBeenCalledWith('org-a', 'veh-1', 'OE_BUILD_DECODE');

    const executeBtn = query(
      '[data-testid="oneauto-confirm-execute"]',
    ) as HTMLButtonElement;
    expect(executeBtn.disabled).toBe(true);

    const checkbox = query(
      '[data-testid="oneauto-confirm-checkbox"]',
    ) as HTMLInputElement;
    await act(async () => {
      checkbox.click();
      executeBtn.click();
      await Promise.resolve();
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const executeArgs = mockExecute.mock.calls[0];
    expect(executeArgs[2].acknowledgeIndicativeNotGuaranteed).toBe(true);
  });

  it('opens MFA stub on STEP_UP_REQUIRED without duplicate execute on immediate retry guard', async () => {
    mockGetCatalog.mockResolvedValue({
      services: [catalogEntry('OE_BUILD_DECODE', 'AVAILABLE', true, 100)],
      indicativePricingDisclaimer: 'indicative',
    });
    mockQuote.mockResolvedValue({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      serviceSku: 'OE_BUILD_DECODE',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      estimatedPriceMinor: 100,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      executionMode: 'SYNC',
      indicativeNotGuaranteed: true,
      quoteIssuedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
      contractGate: { serviceSku: 'OE_BUILD_DECODE', executable: true, reason: 'EXECUTABLE', unverifiedFields: [] },
    });
    mockExecute.mockResolvedValueOnce({
      ok: false,
      status: 403,
      errorBody: { code: 'STEP_UP_REQUIRED' },
      errorMessage: '[STEP_UP_REQUIRED] MFA required',
    });

    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      (query('[data-testid="oneauto-select-OE_BUILD_DECODE"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    const checkbox = query('[data-testid="oneauto-confirm-checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.click();
      (query('[data-testid="oneauto-confirm-execute"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(query('[data-testid="mfa-step-up-stub"]')).toBeTruthy();
  });

  it('stops polling after bounded attempts', async () => {
    mockGetCatalog.mockResolvedValue({
      services: [catalogEntry('OE_BUILD_DECODE', 'AVAILABLE', true, 100)],
      indicativePricingDisclaimer: 'indicative',
    });
    mockQuote.mockResolvedValue({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      serviceSku: 'OE_BUILD_DECODE',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      estimatedPriceMinor: 100,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      executionMode: 'SYNC',
      indicativeNotGuaranteed: true,
      quoteIssuedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
      contractGate: { serviceSku: 'OE_BUILD_DECODE', executable: true, reason: 'EXECUTABLE', unverifiedFields: [] },
    });
    mockExecute.mockResolvedValue({
      ok: true,
      data: {
        id: 'job-poll',
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        status: 'RUNNING',
        serviceSku: 'OE_BUILD_DECODE',
        vinSnapshot: 'WVWZZZ3CZWE123456',
        idempotencyKey: 'idem',
        providerRequestId: null,
        estimatedPriceMinor: 100,
        confirmedPriceMinor: 100,
        currency: 'GBP',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date().toISOString(),
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 0,
        lastErrorCode: null,
        initialProviderDispatchAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    mockGetJob.mockResolvedValue({
      id: 'job-poll',
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      status: 'RUNNING',
      serviceSku: 'OE_BUILD_DECODE',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      idempotencyKey: 'idem',
      providerRequestId: null,
      estimatedPriceMinor: 100,
      confirmedPriceMinor: 100,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      costConfirmedAt: new Date().toISOString(),
      actualChargeMinor: null,
      actualChargeKnown: false,
      pollAttemptCount: 0,
      lastErrorCode: null,
      initialProviderDispatchAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      (query('[data-testid="oneauto-select-OE_BUILD_DECODE"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await act(async () => {
      (query('[data-testid="oneauto-confirm-checkbox"]') as HTMLInputElement).click();
      (query('[data-testid="oneauto-confirm-execute"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });

    await act(async () => {
      for (let i = 0; i < ONEAUTO_MAX_POLL_ATTEMPTS + 2; i++) {
        await vi.advanceTimersByTimeAsync(ONEAUTO_POLL_INTERVAL_MS);
      }
    });

    expect(mockGetJob.mock.calls.length).toBeLessThanOrEqual(ONEAUTO_MAX_POLL_ATTEMPTS + 1);
    expect(query('[data-testid="oneauto-execute-error"]')?.textContent ?? '').toMatch(/poll|Status/i);
  });

  it('shows read-only result viewer without mutating specs', async () => {
    mockGetCatalog.mockResolvedValue({
      services: [catalogEntry('RECALL_CHECK', 'AVAILABLE', true, 50)],
      indicativePricingDisclaimer: 'indicative',
    });
    mockQuote.mockResolvedValue({
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      serviceSku: 'RECALL_CHECK',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      estimatedPriceMinor: 50,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      executionMode: 'SYNC',
      indicativeNotGuaranteed: true,
      quoteIssuedAt: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 60000).toISOString(),
      contractGate: { serviceSku: 'RECALL_CHECK', executable: true, reason: 'EXECUTABLE', unverifiedFields: [] },
    });
    mockExecute.mockResolvedValue({
      ok: true,
      data: {
        id: 'job-res',
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        status: 'SUCCEEDED',
        serviceSku: 'RECALL_CHECK',
        vinSnapshot: 'WVWZZZ3CZWE123456',
        idempotencyKey: 'idem-res',
        providerRequestId: 'p1',
        estimatedPriceMinor: 50,
        confirmedPriceMinor: 50,
        currency: 'GBP',
        pricingSourceVersion: 'v1',
        costConfirmedAt: new Date().toISOString(),
        actualChargeMinor: null,
        actualChargeKnown: false,
        pollAttemptCount: 0,
        lastErrorCode: null,
        initialProviderDispatchAt: null,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    const jobDto = {
      id: 'job-res',
      organizationId: 'org-a',
      vehicleId: 'veh-1',
      status: 'SUCCEEDED' as const,
      serviceSku: 'RECALL_CHECK',
      vinSnapshot: 'WVWZZZ3CZWE123456',
      idempotencyKey: 'idem-res',
      providerRequestId: 'p1',
      estimatedPriceMinor: 50,
      confirmedPriceMinor: 50,
      currency: 'GBP',
      pricingSourceVersion: 'v1',
      costConfirmedAt: new Date().toISOString(),
      actualChargeMinor: null,
      actualChargeKnown: false,
      pollAttemptCount: 1,
      lastErrorCode: null,
      initialProviderDispatchAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockGetJob.mockResolvedValue(jobDto);
    mockGetJobResult.mockResolvedValue({
      job: jobDto,
      latestResponse: {
        httpStatus: 200,
        providerStatusHeader: null,
        responseBodyJson: { recalls: [] },
        fetchedAt: new Date().toISOString(),
      },
      actualChargeKnown: false,
      actualChargeMinor: null,
    });

    const { query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      (query('[data-testid="oneauto-select-RECALL_CHECK"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    await act(async () => {
      (query('[data-testid="oneauto-confirm-checkbox"]') as HTMLInputElement).click();
      (query('[data-testid="oneauto-confirm-execute"]') as HTMLButtonElement).click();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(ONEAUTO_POLL_INTERVAL_MS);
    });

    expect(query('[data-testid="oneauto-result-viewer"]')).toBeTruthy();
    expect(query('[data-testid="oneauto-result-body"]')?.textContent).toContain('recalls');
  });

  it('does not leak vehicle context across org/vehicle changes', async () => {
    const { root, props, query } = renderDialog();
    await act(async () => {
      await Promise.resolve();
    });
    expect(query('[data-testid="oneauto-context-binding"]')?.textContent).toContain('Org A');

    await act(async () => {
      root.render(
        createElement(LanguageProvider, {
          children: createElement(OneAutoServiceDialog, {
            ...props,
            organizationId: 'org-b',
            organizationName: 'Org B',
            vehicleId: 'veh-2',
            vehicleLabel: 'BMW i3',
          }),
        }),
      );
      await Promise.resolve();
    });
    expect(query('[data-testid="oneauto-context-binding"]')?.textContent).toContain('Org B');
    expect(query('[data-testid="oneauto-context-binding"]')?.textContent).not.toContain('Org A');
  });
});
