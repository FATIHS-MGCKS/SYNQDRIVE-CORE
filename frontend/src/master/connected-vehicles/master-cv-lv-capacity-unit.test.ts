import { describe, expect, it } from 'vitest';
import { OFFICIAL_PRODUCT_LOCALE_CODES } from '../../i18n/locales';
import { masterCvTechnicalSpecsDe } from '../../i18n/translations/master.cv.technicalSpecs.de';
import { masterCvTechnicalSpecsEn } from '../../i18n/translations/master.cv.technicalSpecs.en';
import { masterCvTechnicalSpecsPl } from '../../i18n/translations/master.cv.technicalSpecs.pl';
import { masterCvTechnicalSpecsFr } from '../../i18n/translations/master.cv.technicalSpecs.fr';
import { masterCvTechnicalSpecsCs } from '../../i18n/translations/master.cv.technicalSpecs.cs';
import { masterCvTechnicalSpecsNl } from '../../i18n/translations/master.cv.technicalSpecs.nl';
import { masterCvTechnicalSpecsEs } from '../../i18n/translations/master.cv.technicalSpecs.es';
import { masterCvTechnicalSpecsIt } from '../../i18n/translations/master.cv.technicalSpecs.it';
import { masterCvTechnicalSpecsTr } from '../../i18n/translations/master.cv.technicalSpecs.tr';

const KEY = 'master.cv.technicalSpecs.unitAmpere' as const;

const byLocale: Record<(typeof OFFICIAL_PRODUCT_LOCALE_CODES)[number], Record<string, string>> = {
  de: masterCvTechnicalSpecsDe,
  en: masterCvTechnicalSpecsEn,
  pl: masterCvTechnicalSpecsPl,
  fr: masterCvTechnicalSpecsFr,
  cs: masterCvTechnicalSpecsCs,
  nl: masterCvTechnicalSpecsNl,
  es: masterCvTechnicalSpecsEs,
  tr: masterCvTechnicalSpecsTr,
  it: masterCvTechnicalSpecsIt,
};

describe('master CV LV battery capacity unit (Ah semantics)', () => {
  it('uses ampere-hour unit Ah in all nine product locales (not amperes A)', () => {
    for (const locale of OFFICIAL_PRODUCT_LOCALE_CODES) {
      const dict = byLocale[locale];
      expect(dict[KEY], locale).toBe('Ah');
      expect(dict[KEY], locale).not.toBe('A');
    }
  });
});
