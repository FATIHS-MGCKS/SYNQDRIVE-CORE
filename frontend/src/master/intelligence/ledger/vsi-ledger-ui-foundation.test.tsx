// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import {
  EvidenceDimensionChip,
  EvidenceSummaryStrip,
  EvidenceTimestamp,
  LimitationTagList,
  ProvenanceList,
  SignalDetailSheet,
  buildEvidenceSummaryFromSignal,
  dedupeProvenanceTagsForDisplay,
  readCadenceProvenanceTags,
  resolveEvidencePresentationTier,
} from './index';
import {
  ATTRIBUTION_LIMITED_RPM,
  AUDI_ENGINE_RPM_SIGNAL,
  BEV_NOT_APPLICABLE_SIGNAL,
  STALE_OBSERVATION_SIGNAL,
  UNKNOWN_APPLICABILITY_SIGNAL,
} from './ledger-test-fixtures';

describe('dedupeProvenanceTagsForDisplay', () => {
  it('dedupes exact tags for display only while preserving order', () => {
    const input = ['A', 'B', 'A', 'A', 'C', 'B'];
    expect(dedupeProvenanceTagsForDisplay(input)).toEqual(['A', 'B', 'C']);
    expect(input).toEqual(['A', 'B', 'A', 'A', 'C', 'B']);
  });
});

describe('resolveEvidencePresentationTier', () => {
  it('keeps NEVER_OBSERVED neutral and PROVEN_HISTORICAL_ONLY neutral', () => {
    expect(resolveEvidencePresentationTier('observation', 'NEVER_OBSERVED')).toBe('neutral');
    expect(resolveEvidencePresentationTier('combinedRpm', 'PROVEN_HISTORICAL_ONLY')).toBe('neutral');
  });

  it('uses amber for attribution-limited combined RPM', () => {
    expect(
      resolveEvidencePresentationTier('combinedRpm', 'NOT_PROVEN', { attributionLimited: true }),
    ).toBe('amber');
  });
});

describe('VSI ledger UI foundation', () => {
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
    document.body.innerHTML = '';
  });

  function mount(...children: ReactNode[]) {
    act(() => {
      root.render(createElement(LanguageProvider, null, ...children));
    });
  }

  it('shows NEVER_OBSERVED and PROVEN_HISTORICAL_ONLY as separate dimensions', () => {
    const items = buildEvidenceSummaryFromSignal(AUDI_ENGINE_RPM_SIGNAL);
    mount(
      createElement(EvidenceSummaryStrip, {
        items,
        showRpmCompatibilityNote: true,
      }),
    );
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Never observed/i);
    expect(text).toMatch(/Proven historical only/i);
    expect(text).toMatch(/Compatible statements/i);
  });

  it('renders NOT_APPLICABLE with muted styling distinct from UNKNOWN', () => {
    mount(
      createElement(EvidenceDimensionChip, {
        kind: 'applicability',
        value: 'NOT_APPLICABLE',
      }),
      createElement(EvidenceDimensionChip, {
        kind: 'applicability',
        value: 'UNKNOWN',
      }),
    );
    const chips = document.querySelectorAll('[title]');
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).toMatch(/Not applicable/i);
    expect(document.body.textContent).toMatch(/Unknown/i);
  });

  it('shows missing confidence as em dash without implying error', () => {
    mount(
      createElement(EvidenceDimensionChip, {
        kind: 'confidence',
        value: null,
      }),
    );
    expect(document.body.textContent).toContain('—');
  });

  it('dedupes duplicate provenance in ProvenanceList lanes', () => {
    const cadenceTags = readCadenceProvenanceTags(AUDI_ENGINE_RPM_SIGNAL.cadenceIntelligence);
    mount(
      createElement(ProvenanceList, {
        snapshotTags: AUDI_ENGINE_RPM_SIGNAL.evidenceProvenance,
        cadenceTags,
      }),
    );
    const codes = [...document.querySelectorAll('code')].map((el) => el.textContent);
    const hfCount = codes.filter((c) => c === 'CLICKHOUSE_TELEMETRY_HF_POINTS').length;
    expect(hfCount).toBe(1);
  });

  it('shows empty cadence lane without inferring evidence from blob presence alone', () => {
    mount(
      createElement(ProvenanceList, {
        snapshotTags: [],
        cadenceTags: [],
      }),
    );
    expect(document.body.textContent).toMatch(/None recorded/i);
  });

  it('renders unknown limitation code safely', () => {
    mount(createElement(LimitationTagList, { codes: ['CUSTOM_UNKNOWN_LIMITATION_X'] }));
    expect(document.body.textContent).toContain('CUSTOM_UNKNOWN_LIMITATION_X');
    expect(document.body.textContent).toMatch(/glossary|Glossar|sözlük|glosario/i);
  });

  it('marks attribution limitation with amber styling', () => {
    mount(
      createElement(LimitationTagList, {
        codes: ATTRIBUTION_LIMITED_RPM.rpmCombinedEvidenceLimitationsV1,
      }),
    );
    expect(document.querySelector('.border-amber-500\\/40')).toBeTruthy();
  });

  it('EvidenceTimestamp uses time element and fetch disclaimer', () => {
    mount(
      createElement(EvidenceTimestamp, {
        kind: 'providerFetch',
        iso: '2026-10-29T22:21:14.621Z',
      }),
    );
    expect(document.querySelector('time[datetime]')).toBeTruthy();
    expect(document.body.textContent).toMatch(/does not prove a new sensor measurement/i);
  });

  it('handles missing timestamps', () => {
    mount(createElement(EvidenceTimestamp, { kind: 'observation', iso: null }));
    expect(document.body.textContent).toContain('—');
  });

  it('wraps summary strip on narrow viewport', () => {
    const narrow = document.createElement('div');
    narrow.style.width = '320px';
    document.body.appendChild(narrow);
    const narrowRoot = createRoot(narrow);
    act(() => {
      narrowRoot.render(
        createElement(
          LanguageProvider,
          null,
          createElement(EvidenceSummaryStrip, {
            items: buildEvidenceSummaryFromSignal(STALE_OBSERVATION_SIGNAL),
          }),
        ),
      );
    });
    expect(narrow.querySelector('ul.flex-wrap')).toBeTruthy();
    act(() => narrowRoot.unmount());
    narrow.remove();
  });

  it('SignalDetailSheet exposes dialog, prev/next controls, and reduced-motion classes', () => {
    mount(
      createElement(SignalDetailSheet, {
        open: true,
        onOpenChange: () => {},
        title: 'engine_rpm',
        hasPrevious: false,
        hasNext: true,
        onNext: vi.fn(),
        children: createElement('p', null, 'detail body'),
      }),
    );
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="sheet-title"]')?.textContent).toBe('engine_rpm');
    const buttons = document.querySelectorAll('button');
    const disabled = [...buttons].filter((b) => b.hasAttribute('disabled'));
    expect(disabled.length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('.motion-reduce\\:animate-none')).toBeTruthy();
  });

  it('buildEvidenceSummaryFromSignal covers BEV NOT_APPLICABLE and UNKNOWN applicability fixtures', () => {
    const bev = buildEvidenceSummaryFromSignal(BEV_NOT_APPLICABLE_SIGNAL);
    expect(bev.find((i) => i.kind === 'combinedRpm')?.value).toBe('NOT_APPLICABLE');
    const unknown = buildEvidenceSummaryFromSignal(UNKNOWN_APPLICABILITY_SIGNAL);
    expect(unknown.find((i) => i.kind === 'applicability')?.value).toBe('UNKNOWN');
    expect(unknown.find((i) => i.kind === 'confidence')?.value).toBeNull();
  });
});
