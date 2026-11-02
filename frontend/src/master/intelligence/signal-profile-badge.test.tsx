// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { SignalProfileBadge } from './SignalProfileBadge';
import {
  EvaluationBlockedBanner,
  EvidenceFreshnessHint,
  ShadowVsRealPollHint,
} from './EvidenceFreshnessHint';
import { VsiMasterIntelligenceView } from './VsiMasterIntelligenceView';

describe('SignalProfileBadge presentation', () => {
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

  function mount(...children: ReactNode[]) {
    act(() => {
      root.render(createElement(LanguageProvider, null, ...children));
    });
  }

  it('renders LV_8H_OBSERVED label and explanation', () => {
    mount(createElement(SignalProfileBadge, { kind: 'lv', profile: 'LV_8H_OBSERVED' }));
    expect(document.body.textContent).toMatch(/8-hour standby/i);
  });

  it('distinguishes BEV RPM NOT_APPLICABLE from UNKNOWN', () => {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(SignalProfileBadge, {
            kind: 'rpm',
            profile: 'UNKNOWN',
            applicability: 'NOT_APPLICABLE',
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/not applicable/i);
    expect(document.body.textContent).toMatch(/not the same as unknown/i);
  });

  it('shows active trip blocker copy', () => {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(EvaluationBlockedBanner, {
            limitationCode: 'OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION',
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/Evaluation blocked/i);
    expect(document.body.textContent).toMatch(/OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION/);
  });

  it('distinguishes shadow from verified real execution labels', () => {
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(EvidenceFreshnessHint, {
            kind: 'simulated_shadow',
            evaluatedAt: '2026-10-28T10:00:00.000Z',
          }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/simulated \/ shadow/i);

    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(EvidenceFreshnessHint, { kind: 'verified_real_execution' }),
        ),
      );
    });
    expect(document.body.textContent).toMatch(/verified real poll/i);

    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(ShadowVsRealPollHint)));
    });
    expect(document.body.textContent).toMatch(/shadow decisions/i);
  });

  it('uses responsive grid classes on VSI view', () => {
    act(() => {
      root.render(createElement(LanguageProvider, null, createElement(VsiMasterIntelligenceView)));
    });
    expect(document.querySelector('.sm\\:grid-cols-3')).toBeTruthy();
  });
});
