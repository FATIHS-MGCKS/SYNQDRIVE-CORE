import { describe, expect, it } from 'vitest';

import { masterIntelligenceVsiV2Cs } from './translations/master.intelligence.vsi-v2.cs';
import { masterIntelligenceVsiV2De } from './translations/master.intelligence.vsi-v2.de';
import { masterIntelligenceVsiV2En } from './translations/master.intelligence.vsi-v2.en';
import { masterIntelligenceVsiV2Es } from './translations/master.intelligence.vsi-v2.es';
import { masterIntelligenceVsiV2Fr } from './translations/master.intelligence.vsi-v2.fr';
import { masterIntelligenceVsiV2It } from './translations/master.intelligence.vsi-v2.it';
import { masterIntelligenceVsiV2Nl } from './translations/master.intelligence.vsi-v2.nl';
import { masterIntelligenceVsiV2Pl } from './translations/master.intelligence.vsi-v2.pl';
import { masterIntelligenceVsiV2Tr } from './translations/master.intelligence.vsi-v2.tr';

type VsiV2Key = keyof typeof masterIntelligenceVsiV2En;

/** International tokens that may appear unchanged inside translated strings. */
export const ALLOWED_EN_IDENTICAL_SUBSTRINGS = [
  'FSD3',
  'FSD4',
  'FSD',
  'VSD',
  'HTTP',
  'JSON',
  'UTC',
  'VSI',
  'DIMO',
  'NULL',
  'RPM_1HZ',
  'LV_8H_OBSERVED',
  'RPM_STANDARD',
  'APDS',
  'read-only',
  'Read-only',
  'provider-native',
  'tab=revisions',
  'LV',
  'RPM',
  '1 Hz',
  '1-Hz',
] as const;

/** Entire locale values that may legitimately match English (short UI / loanwords). */
export const ALLOWED_FULL_STRING_IDENTICAL = new Set<string>([
  'Snapshot',
  'Detail',
  'Stage',
  'Stages',
  // Romance locales: native negation matches English orthography.
  'No',
]);

const CONCEPT_KEY_PATTERN = /^master\.intelligence\.vsi\.queries\.concept[ABCD]$/;

const LOCALES = {
  pl: masterIntelligenceVsiV2Pl,
  fr: masterIntelligenceVsiV2Fr,
  cs: masterIntelligenceVsiV2Cs,
  nl: masterIntelligenceVsiV2Nl,
  es: masterIntelligenceVsiV2Es,
  tr: masterIntelligenceVsiV2Tr,
  it: masterIntelligenceVsiV2It,
  de: masterIntelligenceVsiV2De,
} as const satisfies Record<string, Record<VsiV2Key, string>>;

const EN_KEYS = Object.keys(masterIntelligenceVsiV2En) as VsiV2Key[];

function extractPlaceholders(value: string): string[] {
  const matches = value.match(/\{\{[^}]+\}\}/g);
  return matches ? [...matches].sort() : [];
}

function stripAllowedInternationalTerms(value: string): string {
  let result = value;
  for (const token of ALLOWED_EN_IDENTICAL_SUBSTRINGS) {
    result = result.split(token).join('');
  }
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result.replace(/\s+/g, ' ').trim();
}

export function isAllowedEnglishIdentical(key: VsiV2Key, enValue: string, localeValue: string): boolean {
  if (enValue !== localeValue) {
    return false;
  }
  if (CONCEPT_KEY_PATTERN.test(key)) {
    return false;
  }
  if (ALLOWED_FULL_STRING_IDENTICAL.has(enValue)) {
    return true;
  }
  const stripped = stripAllowedInternationalTerms(enValue);
  if (stripped.length === 0) {
    return true;
  }
  if (/^[\p{P}\p{S}\d\s]+$/u.test(stripped)) {
    return true;
  }
  return false;
}

export function countIdenticalToEn(locale: Record<VsiV2Key, string>): {
  total: number;
  allowed: number;
  unjustified: VsiV2Key[];
} {
  const unjustified: VsiV2Key[] = [];
  let total = 0;
  let allowed = 0;
  for (const key of EN_KEYS) {
    const enValue = masterIntelligenceVsiV2En[key];
    const localeValue = locale[key];
    if (localeValue === enValue) {
      total += 1;
      if (isAllowedEnglishIdentical(key, enValue, localeValue)) {
        allowed += 1;
      } else {
        unjustified.push(key);
      }
    }
  }
  return { total, allowed, unjustified };
}

describe('VSI 2.0 master intelligence native locale dictionaries', () => {
  it('has 161 English source keys', () => {
    expect(EN_KEYS).toHaveLength(161);
  });

  for (const [localeCode, dictionary] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      it('matches English key set exactly', () => {
        expect(Object.keys(dictionary).sort()).toEqual([...EN_KEYS].sort());
      });

      it('has no empty string values', () => {
        for (const key of EN_KEYS) {
          expect(dictionary[key].trim().length, key).toBeGreaterThan(0);
        }
      });

      it('preserves interpolation placeholders from English', () => {
        for (const key of EN_KEYS) {
          expect(extractPlaceholders(dictionary[key]), key).toEqual(extractPlaceholders(masterIntelligenceVsiV2En[key]));
        }
      });

      it('does not leave unjustified English-placeholder copies', () => {
        const { unjustified } = countIdenticalToEn(dictionary);
        expect(unjustified, unjustified.join(', ')).toEqual([]);
      });
    });
  }

  it('reports identical-to-English counts (allowed vs total) per locale', () => {
    const summary = Object.fromEntries(
      Object.entries(LOCALES).map(([code, dict]) => {
        const { total, allowed } = countIdenticalToEn(dict);
        return [code, { identical_to_en: total, allowed_identical: allowed }];
      }),
    );
    expect(summary).toMatchObject({
      pl: expect.objectContaining({ identical_to_en: expect.any(Number) }),
      de: expect.objectContaining({ identical_to_en: 4 }),
    });
    // eslint-disable-next-line no-console -- intentional parity telemetry for CI logs
    console.info('VSI v2 identical_to_en summary', JSON.stringify(summary));
  });
});
