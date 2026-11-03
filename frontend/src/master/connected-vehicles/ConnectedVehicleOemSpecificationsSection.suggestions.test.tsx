// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehicleOemSpecificationsSection } from './ConnectedVehicleOemSpecificationsSection';
import {
  buildOemSpecificationsView,
  type OemSpecificationFieldKey,
} from './connected-vehicle-oem-specifications.util';
import type { OemSuggestionsViewState } from './connected-vehicle-oem-suggestions.types';

function renderSection(
  suggestions: OemSuggestionsViewState,
  overrides?: Partial<Parameters<typeof ConnectedVehicleOemSpecificationsSection>[0]>,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const view = buildOemSpecificationsView({ oemEngineDesc: null });
  const onApply = vi.fn().mockResolvedValue(true);
  act(() => {
    root.render(
      createElement(LanguageProvider, {
        children: createElement(ConnectedVehicleOemSpecificationsSection, {
          view,
          loading: false,
          error: null,
          canEdit: true,
          savingFieldKey: null,
          onSaveField: vi.fn(),
          suggestionsLoading: false,
          suggestions,
          applyingFieldKey: null,
          onApplySuggestedField: onApply,
          ...overrides,
        }),
      }),
    );
  });
  return { container, onApply };
}

describe('ConnectedVehicleOemSpecificationsSection suggestions', () => {
  it('shows feature disabled state', () => {
    const { container } = renderSection({
      featureEnabled: false,
      primary: null,
      loadError: null,
    });
    expect(container.querySelector('[data-testid="cv-oem-suggestions-disabled"]')).toBeTruthy();
  });

  it('renders comparison row and requires confirm before apply', async () => {
    const suggestions: OemSuggestionsViewState = {
      featureEnabled: true,
      loadError: null,
      primary: {
        snapshotId: 's1',
        providerJobId: 'j1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        vinSha256Prefix: 'deadbeef',
        timestamps: {
          providerDataUpdatedAt: null,
          fetchedAt: '2026-01-03T10:00:00.000Z',
          snapshotCreatedAt: '2026-01-03T10:00:00.000Z',
        },
        rows: [
          {
            fieldKey: 'oemEngineDesc' as OemSpecificationFieldKey,
            comparisonState: 'MISSING',
            canonicalValue: null,
            suggestedValue: '2.0 TDI',
            providerFieldPath: 'oem_engine_desc',
            confirmationStatus: null,
          },
        ],
      },
    };
    const { container, onApply } = renderSection(suggestions);
    const applyBtn = container.querySelector(
      '[data-testid="cv-oem-suggestion-apply-oemEngineDesc"]',
    ) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    const checkbox = container.querySelector(
      '[data-testid="cv-oem-suggestion-confirm-oemEngineDesc"]',
    ) as HTMLInputElement;
    await act(async () => {
      checkbox.click();
    });
    await act(async () => {
      applyBtn.click();
    });
    expect(onApply).toHaveBeenCalledWith('oemEngineDesc');
  });

  it('does not render apply for NOT_COMPARABLE code field', () => {
    const suggestions: OemSuggestionsViewState = {
      featureEnabled: true,
      loadError: null,
      primary: {
        snapshotId: 's1',
        providerJobId: 'j1',
        serviceSku: 'OE_VIN_LOOKUP_EU',
        vinSha256Prefix: 'deadbeef',
        timestamps: {
          providerDataUpdatedAt: null,
          fetchedAt: '2026-01-03T10:00:00.000Z',
          snapshotCreatedAt: '2026-01-03T10:00:00.000Z',
        },
        rows: [
          {
            fieldKey: 'oemEngineCode',
            comparisonState: 'NOT_COMPARABLE',
            canonicalValue: null,
            suggestedValue: null,
            providerFieldPath: null,
            confirmationStatus: null,
          },
        ],
      },
    };
    const { container } = renderSection(suggestions);
    expect(
      container.querySelector('[data-testid="cv-oem-suggestion-apply-oemEngineCode"]'),
    ).toBeNull();
  });
});
