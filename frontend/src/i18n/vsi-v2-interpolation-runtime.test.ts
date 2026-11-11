import { describe, expect, it } from 'vitest';

import { interpolateTranslationVars } from '../lib/i18n-interpolate';
import { translateKey } from './LanguageContext';
import { OFFICIAL_PRODUCT_LOCALE_CODES, type SupportedLocale } from './locales';

const RESULT_META_KEY = 'master.intelligence.vsi.fsd.signals.resultMeta' as const;
const CROSS_LINK_KEY = 'master.intelligence.crossLink.contextMissing' as const;
const SINGLE_BRACE_KEY = 'topbar.welcomeBack' as const;

function assertNoUnresolvedPlaceholders(text: string) {
  expect(text).not.toMatch(/\{\{[^}]+\}\}/);
  expect(text).not.toMatch(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/);
}

describe('VSI / master intelligence interpolation at runtime', () => {
  it('renders German FSD signal count metadata without stray braces', () => {
    const result = translateKey('de', RESULT_META_KEY, { count: 1, declared: 2 });
    expect(result.text).toBe('1 Zeilen · deklariert 2');
    assertNoUnresolvedPlaceholders(result.text);
  });

  it.each(OFFICIAL_PRODUCT_LOCALE_CODES as SupportedLocale[])(
    'renders FSD signal count metadata for locale %s',
    (locale) => {
      const result = translateKey(locale, RESULT_META_KEY, { count: 3, declared: 5 });
      expect(result.text).toContain('3');
      expect(result.text).toContain('5');
      assertNoUnresolvedPlaceholders(result.text);
    },
  );

  it.each(OFFICIAL_PRODUCT_LOCALE_CODES as SupportedLocale[])(
    'renders cross-link context message with target for locale %s',
    (locale) => {
      const result = translateKey(locale, CROSS_LINK_KEY, { target: 'APDS' });
      expect(result.text).toContain('APDS');
      assertNoUnresolvedPlaceholders(result.text);
    },
  );

  it('keeps legacy single-brace placeholders working', () => {
    const result = translateKey('en', SINGLE_BRACE_KEY, { name: 'Morgan' });
    expect(result.text).toBe('Welcome back, Morgan');
    assertNoUnresolvedPlaceholders(result.text);
  });

  it('LanguageContext uses dual-brace interpolation via lib helper', () => {
    expect(
      interpolateTranslationVars('{{count}} · {declared}', { count: 1, declared: 2 }),
    ).toBe('1 · 2');
  });

  it('resolves VSI templates at runtime without stray braces', () => {
    const viaKey = translateKey('en', RESULT_META_KEY, { count: 1, declared: 2 });
    expect(viaKey.text).toBe('1 rows returned · declared count 2');
    assertNoUnresolvedPlaceholders(viaKey.text);
  });

});
