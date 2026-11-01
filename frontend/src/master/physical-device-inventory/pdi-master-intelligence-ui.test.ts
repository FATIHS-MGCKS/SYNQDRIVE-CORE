import { describe, expect, it } from 'vitest';
import { masterIntelligenceEn } from '../../i18n/translations/master.intelligence.en';
import { masterIntelligenceDe } from '../../i18n/translations/master.intelligence.de';

const PDI_KEYS = [
  'master.intelligence.pdi.loading',
  'master.intelligence.pdi.error',
  'master.intelligence.pdi.section.identity',
  'master.intelligence.pdi.section.bindings',
  'master.intelligence.pdi.section.crossNav',
  'master.intelligence.pdi.bindings.selectRequired',
  'master.intelligence.pdi.bindings.status.UNKNOWN',
  'master.intelligence.pdi.notApplicableR1',
  'master.intelligence.pdi.noDriftHistory',
] as const;

describe('PDI Master Intelligence i18n', () => {
  it('defines PDI keys in en and de', () => {
    for (const key of PDI_KEYS) {
      expect(masterIntelligenceEn[key]).toBeTruthy();
      expect(masterIntelligenceDe[key]).toBeTruthy();
    }
  });
});

describe('PDI deep link param', () => {
  it('accepts canonical pdiDeviceId UUID in inventory URL', () => {
    const id = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
    const params = new URLSearchParams(`view=device-inventory&pdiDeviceId=${id}`);
    expect(params.get('pdiDeviceId')).toBe(id);
  });
});
