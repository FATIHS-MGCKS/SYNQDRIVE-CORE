// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { OneAutoServiceScheduleResultPanel } from './OneAutoServiceScheduleResultPanel';
import type { OneAutoJobResultResponse } from './oneauto-api.types';

const VIN = 'WVWZZZ3HZLE010725';

const SCHEDULE_JOB: OneAutoJobResultResponse['job'] = {
  id: 'job-sched',
  organizationId: 'o1',
  vehicleId: 'v1',
  vinSnapshot: VIN,
  serviceSku: 'OE_SERVICE_SCHEDULE',
  status: 'SUCCEEDED',
  idempotencyKey: 'k',
  providerRequestId: null,
  estimatedPriceMinor: 210,
  confirmedPriceMinor: 210,
  currency: 'EUR',
  pricingSourceVersion: 'v1',
  costConfirmedAt: null,
  actualChargeMinor: null,
  actualChargeKnown: false,
  pollAttemptCount: 0,
  lastErrorCode: null,
  initialProviderDispatchAt: null,
  expiresAt: null,
  providerResultExpiresAt: null,
  createdAt: '',
  updatedAt: '',
};

function buildSanitizedFixture(): Record<string, unknown> {
  const normal = Array.from({ length: 9 }, (_, i) => ({
    service_id: `n-${i}`,
    service_description: `Normal item ${i + 1}`,
    service_interval_desc: 'Every interval',
    service_months: 12,
    service_kms: i === 0 ? null : 15000 + i,
    service_miles: i === 1 ? null : 9000,
    service_tasks: [
      {
        task_action: 'Check',
        task_description: `Task for normal ${i}`,
        vehicle_position: null,
        task_id: null,
      },
    ],
    service_parts: [
      {
        part_desc: `Part ${i}`,
        part_number: 'P1',
        oe_part_number: i === 2 ? null : `OE-${i}`,
        supplier_desc: 'Supplier',
        part_grade: null,
        supplier_id: null,
      },
    ],
    service_time_hours: 0.5 + i * 0.1,
  }));
  const extra = Array.from({ length: 21 }, (_, i) => ({
    service_id: `e-${i}`,
    service_description: `Extra item ${i + 1}`,
    service_interval_desc: null,
    service_months: null,
    service_kms: null,
    service_miles: null,
    service_tasks: [],
    service_parts: [],
    service_time_hours: null,
  }));
  return {
    success: true,
    result: {
      vehicle_identification_number: VIN,
      normal_services: normal,
      extra_services: extra,
    },
  };
}

function renderPanel(result: OneAutoJobResultResponse) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      createElement(LanguageProvider, {
        children: createElement(OneAutoServiceScheduleResultPanel, {
          result,
          vehicleLabel: 'Fixture Vehicle',
        }),
      }),
    );
  });
  return { container, root, query: (sel: string) => document.querySelector(sel) };
}

describe('OneAutoServiceScheduleResultPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders 9+30 counts for sanitized live-shaped fixture', () => {
    const result: OneAutoJobResultResponse = {
      job: SCHEDULE_JOB,
      latestResponse: {
        httpStatus: 200,
        providerStatusHeader: null,
        fetchedAt: new Date().toISOString(),
        responseBodyJson: buildSanitizedFixture(),
      },
      actualChargeKnown: false,
      actualChargeMinor: null,
    };
    const { query } = renderPanel(result);
    expect(query('[data-testid="oneauto-schedule-count-normal"]')?.textContent?.trim()).toBe('9');
    expect(query('[data-testid="oneauto-schedule-count-extra"]')?.textContent?.trim()).toBe('21');
    expect(query('[data-testid="oneauto-schedule-count-total"]')?.textContent?.trim()).toBe('30');
    expect(query('[data-testid="oneauto-schedule-normal-list"]')?.querySelectorAll('li').length).toBe(9);
    expect(query('[data-testid="oneauto-schedule-extra-list"]')?.querySelectorAll('li').length).toBe(21);
  });

  it('filters to matching section only and keeps expand/collapse on visible rows', async () => {
    const body = buildSanitizedFixture();
    const normal = (body.result as Record<string, unknown>).normal_services as Record<string, unknown>[];
    normal[0].service_description = 'Alpha search token unique';
    const result: OneAutoJobResultResponse = {
      job: SCHEDULE_JOB,
      latestResponse: {
        httpStatus: 200,
        providerStatusHeader: null,
        fetchedAt: new Date().toISOString(),
        responseBodyJson: body,
      },
      actualChargeKnown: false,
      actualChargeMinor: null,
    };
    const { query } = renderPanel(result);
    const search = query('[data-testid="oneauto-schedule-search"]') as HTMLInputElement;
    await act(async () => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc?.set?.call(search, 'Alpha search token unique');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(query('[data-testid="oneauto-schedule-normal-list"]')?.querySelectorAll('li').length).toBe(1);
    expect(query('[data-testid="oneauto-schedule-extra-list"]')).toBeNull();
    const expandBtn = query('[data-testid="oneauto-schedule-expand-all"]') as HTMLButtonElement;
    await act(async () => {
      expandBtn.click();
    });
    const triggerAfterExpand = query(
      '[data-testid="oneauto-schedule-normal-list"] [data-oneauto-schedule-trigger]',
    ) as HTMLButtonElement | null;
    expect(triggerAfterExpand?.getAttribute('aria-expanded')).toBe('true');
    const collapseBtn = query('[data-testid="oneauto-schedule-collapse-all"]') as HTMLButtonElement;
    await act(async () => {
      collapseBtn.click();
    });
    const triggerAfterCollapse = query(
      '[data-testid="oneauto-schedule-normal-list"] [data-oneauto-schedule-trigger]',
    ) as HTMLButtonElement | null;
    expect(triggerAfterCollapse?.getAttribute('aria-expanded')).toBe('false');
  });
});
