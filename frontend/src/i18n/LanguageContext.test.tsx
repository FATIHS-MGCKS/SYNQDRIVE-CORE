// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LanguageProvider,
  syncDocumentLanguage,
  translateKey,
  useLanguage,
  usesLocaleDictionary,
} from './LanguageContext';
import { LOCALE_STORAGE_KEY, readPersistedLocale, writePersistedLocale } from './locales';
import * as translationRegistry from './translation-registry';
import { en } from './translations/en';

function Probe({ onChange }: { onChange: (value: ReturnType<typeof useLanguage>) => void }) {
  const value = useLanguage();
  onChange(value);
  return null;
}

describe('platform LanguageProvider runtime', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shares the same provider state between nested consumers', () => {
    let latest: ReturnType<typeof useLanguage> | null = null;
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(Probe, {
            onChange: (value) => {
              latest = value;
            },
          }),
        ),
      );
    });

    expect(latest).not.toBeNull();
    act(() => latest!.setLocale('it'));
    expect(latest!.locale).toBe('it');
    expect(latest!.localeMetadata.nativeName).toBe('Italiano');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('it');
  });

  it('persists valid locale and rejects invalid persisted locale on next boot', () => {
    writePersistedLocale('pl');
    expect(readPersistedLocale()).toBe('pl');

    localStorage.setItem(LOCALE_STORAGE_KEY, 'invalid-locale');
    expect(readPersistedLocale()).toBeNull();
  });

  it('updates document.documentElement.lang using canonical BCP-47 metadata', () => {
    syncDocumentLanguage('tr');
    expect(document.documentElement.lang).toBe('tr-TR');
    syncDocumentLanguage('it');
    expect(document.documentElement.lang).toBe('it-IT');
  });

  it('uses explicit English fallback for Turkish keys outside the sparse partial dictionary', () => {
    const result = translateKey('tr', 'common.save');
    expect(result.source).toBe('fallback-en');
    expect(result.text.length).toBeGreaterThan(0);
    expect(usesLocaleDictionary('tr')).toBe(true);
    expect(usesLocaleDictionary('it')).toBe(true);
    const owned = translateKey('tr', 'trips.drivingImpact.quality.partial');
    expect(owned.source).toBe('locale');
  });

  it('keeps Italian dictionary-backed translations', () => {
    const result = translateKey('it', 'common.save');
    expect(result.source).toBe('locale');
    expect(result.text).toBe('Salva');
  });

  it('exposes translate() diagnostics for missing keys', () => {
    const missingKey = 'this.key.does.not.exist' as never;
    const result = translateKey('en', missingKey);
    expect(result.source).toBe('missing-key');
    expect(result.text).toBe('this.key.does.not.exist');
  });

  it('interpolates double-brace templates on the English fallback path', () => {
    const fallbackKey = 'topbar.welcomeBack' as const;
    const originalTemplate = en[fallbackKey];
    const originalGet = translationRegistry.getLocaleDictionary;
    try {
      (en as Record<string, string>)[fallbackKey] = 'Welcome {{name}} · role {role}';
      vi.spyOn(translationRegistry, 'getLocaleDictionary').mockImplementation((locale) => {
        const dictionary = originalGet(locale);
        if (locale === 'pl') {
          const { [fallbackKey]: _removed, ...withoutKey } = dictionary as Record<string, string>;
          return withoutKey;
        }
        return dictionary;
      });

      const result = translateKey('pl', fallbackKey, { name: 'Morgan', role: 'admin' });
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe('Welcome Morgan · role admin');
    } finally {
      (en as Record<string, string>)[fallbackKey] = originalTemplate;
      vi.restoreAllMocks();
    }
  });

});

describe('locale precedence', () => {
  it('prefers persisted locale over browser preferences', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'it');
    vi.stubGlobal('navigator', { languages: ['de-DE'] });

    const captured: { current: ReturnType<typeof useLanguage> | null } = { current: null };
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(Probe, {
            onChange: (value) => {
              captured.current = value;
            },
          }),
        ),
      );
    });

    expect(captured.current?.locale).toBe('it');
    act(() => root.unmount());
    container.remove();
  });
});
