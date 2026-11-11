// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import type { MasterFsdSignalExplorerPageDtoV1 } from '../vsi-master-fsd-read-api.types';
import type { FsdCatalogSearchOutcome } from '../vsi-fsd-signal-catalog.util';
import { VsiFsdSignalsTab } from './VsiFsdSignalsTab';

const signalsPage: MasterFsdSignalExplorerPageDtoV1 = {
  contractVersion: 'vsi-master-fsd-read-v1',
  organizationId: 'o1',
  vehicleId: 'v1',
  providerSourceLinkId: 'l1',
  catalogRunId: 'run-1',
  catalogAuthoritative: true,
  historicalLink: 'NOT_AVAILABLE',
  items: [
    {
      providerNativeSignalName: 'engine_keep',
      declaredByProvider: true,
      schemaShape: null,
      presentationState: 'DECLARED_ONLY',
      catalogDeclared: true,
      snapshotEvidence: 'NOT_EXECUTED',
      historicalEvidence: 'NOT_EXECUTED',
      catalogQuery: { queryPlanned: false, queryAccepted: null, observedValue: null },
      snapshotQuery: null,
      historicalQuery: null,
      coverageAggregate: null,
      sourceRunId: null,
      provenanceReference: null,
    },
  ],
  page: { limit: 50, nextCursor: null, hasMore: false },
  aggregates: { declaredSignalCount: 2, logicalSignalsReturned: 1 },
};

const identityViolationOutcome: FsdCatalogSearchOutcome = {
  items: signalsPage.items,
  catalogExhaustive: false,
  pagesScanned: 2,
  totalRowsLoaded: 60,
  query: 'engine',
  basePage: null,
  catalogIdentityViolation: true,
};

const boundIncompleteOutcome: FsdCatalogSearchOutcome = {
  items: signalsPage.items,
  catalogExhaustive: false,
  pagesScanned: 40,
  totalRowsLoaded: 2000,
  query: 'engine',
  basePage: null,
};

describe('VsiFsdSignalsTab catalog search status', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(ui: ReactNode) {
    act(() => {
      root.render(createElement(LanguageProvider, null, ui));
    });
  }

  function baseProps(overrides: Partial<Parameters<typeof VsiFsdSignalsTab>[0]> = {}) {
    return {
      scopeKey: 'o1:v1:l1',
      signals: signalsPage,
      signalsSearch: null as FsdCatalogSearchOutcome | null,
      signalsLoading: false,
      signalsError: null,
      onLoadPage: vi.fn(),
      onSearch: vi.fn(),
      catalogAuthoritative: true,
      historicalLink: 'NOT_AVAILABLE' as const,
      ...overrides,
    };
  }

  it('surfaces catalog identity violation and hides incomplete-only messaging', () => {
    mount(createElement(VsiFsdSignalsTab, baseProps({ signalsSearch: identityViolationOutcome })));
    expect(document.querySelector('[data-testid="vsi-fsd-signals-catalog-identity-violation"]')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Catalog identity changed while scanning/i);
    expect(document.body.textContent).not.toMatch(/Catalog scan stopped after 40 pages/i);
    expect(document.querySelector('[data-testid="vsi-fsd-signals-search-exhaustive"]')).toBeNull();
  });

  it('shows bound incomplete search without identity violation banner', () => {
    mount(createElement(VsiFsdSignalsTab, baseProps({ signalsSearch: boundIncompleteOutcome })));
    expect(document.querySelector('[data-testid="vsi-fsd-signals-catalog-identity-violation"]')).toBeNull();
    expect(document.body.textContent).toMatch(/40/);
    expect(document.body.textContent).toMatch(/pages|Seiten/);
  });
});
