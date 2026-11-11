/**
 * Canonical SynqDrive platform localization runtime.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ownsTranslationKey } from './dictionary-types';
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  getLocaleMetadata,
  isSupportedLocale,
  resolveInitialPlatformLocale,
  writePersistedLocale,
  type LocaleMetadata,
  type SupportedLocale,
} from './locales';
import { getLocaleDictionary, getTranslationRegistryEntry } from './translation-registry';
import { en, type TranslationKey } from './translations/en';

export type Locale = SupportedLocale;
export type { TranslationKey, LocaleMetadata, SupportedLocale };

export type TranslationSource = 'locale' | 'fallback-en' | 'missing-key';

export type TranslateResult = {
  text: string;
  source: TranslationSource;
  key: TranslationKey;
  locale: SupportedLocale;
};

const reportedTranslationFallbacks = new Set<string>();

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  let result = text;
  for (const [name, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}

function reportTranslationFallback(
  locale: SupportedLocale,
  key: TranslationKey,
  source: Exclude<TranslationSource, 'locale'>,
): void {
  if (!import.meta.env.DEV) return;
  const signature = `${locale}:${key}:${source}`;
  if (reportedTranslationFallbacks.has(signature)) return;
  reportedTranslationFallbacks.add(signature);
  console.warn(`[i18n] ${source} for locale "${locale}" key "${key}"`);
}

export function translateKey(
  locale: SupportedLocale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): TranslateResult {
  const dictionary = getLocaleDictionary(locale);
  const localeValue = ownsTranslationKey(dictionary, key) ? dictionary![key] : undefined;

  if (localeValue !== undefined) {
    return {
      text: interpolate(localeValue, vars),
      source: 'locale',
      key,
      locale,
    };
  }

  const englishValue = en[key];
  if (englishValue !== undefined) {
    const usesEnglishFallback = locale !== 'en';
    if (usesEnglishFallback) {
      reportTranslationFallback(locale, key, 'fallback-en');
    }
    return {
      text: interpolate(englishValue, vars),
      source: usesEnglishFallback ? 'fallback-en' : 'locale',
      key,
      locale,
    };
  }

  reportTranslationFallback(locale, key, 'missing-key');

  return {
    text: key,
    source: 'missing-key',
    key,
    locale,
  };
}

export function syncDocumentLanguage(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = getFormattingLocale(locale);
}

interface LanguageContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  localeMetadata: LocaleMetadata;
  formattingLocale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  translate: (
    key: TranslationKey,
    vars?: Record<string, string | number>,
  ) => TranslateResult;
  usesDictionaryFallback: boolean;
}

const defaultTranslate = (key: TranslationKey, vars?: Record<string, string | number>) =>
  translateKey(DEFAULT_PRODUCT_LOCALE, key, vars);

const defaultValue: LanguageContextValue = {
  locale: DEFAULT_PRODUCT_LOCALE,
  setLocale: () => {},
  localeMetadata: getLocaleMetadata(DEFAULT_PRODUCT_LOCALE),
  formattingLocale: getFormattingLocale(DEFAULT_PRODUCT_LOCALE),
  t: (key, vars) => defaultTranslate(key, vars).text,
  translate: defaultTranslate,
  usesDictionaryFallback: false,
};

const LanguageContext = createContext<LanguageContextValue>(defaultValue);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => resolveInitialPlatformLocale());

  const setLocale = useCallback((next: SupportedLocale) => {
    if (!isSupportedLocale(next)) return;
    setLocaleState(next);
    writePersistedLocale(next);
    syncDocumentLanguage(next);
  }, []);

  useEffect(() => {
    syncDocumentLanguage(locale);
  }, [locale]);

  const translate = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translateKey(locale, key, vars),
    [locale],
  );

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(key, vars).text,
    [translate],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      localeMetadata: getLocaleMetadata(locale),
      formattingLocale: getFormattingLocale(locale),
      t,
      translate,
      usesDictionaryFallback: getTranslationRegistryEntry(locale).usesEnglishFallback,
    }),
    [locale, setLocale, t, translate],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function usesLocaleDictionary(locale: SupportedLocale): boolean {
  return getTranslationRegistryEntry(locale).hasLocaleDictionary;
}

export { LOCALE_STORAGE_KEY } from './locales';
