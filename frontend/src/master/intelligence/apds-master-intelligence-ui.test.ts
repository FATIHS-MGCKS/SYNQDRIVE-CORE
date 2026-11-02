import { describe, expect, it } from 'vitest';
import { masterIntelligenceEn } from '../../i18n/translations/master.intelligence.en';
import { masterIntelligenceDe } from '../../i18n/translations/master.intelligence.de';
import { masterIntelligencePl } from '../../i18n/translations/master.intelligence.pl';
import { masterIntelligenceFr } from '../../i18n/translations/master.intelligence.fr';
import { masterIntelligenceCs } from '../../i18n/translations/master.intelligence.cs';
import { masterIntelligenceNl } from '../../i18n/translations/master.intelligence.nl';
import { masterIntelligenceEs } from '../../i18n/translations/master.intelligence.es';
import { masterIntelligenceTr } from '../../i18n/translations/master.intelligence.tr';
import { masterIntelligenceIt } from '../../i18n/translations/master.intelligence.it';
import {
  buildMasterIntelligenceSearch,
  emptyIntelligenceContext,
  parseMasterIntelligenceContext,
} from './master-intelligence-url';

const APDS_PRESENTATION_KEYS = [
  'master.intelligence.apds.availability.AVAILABLE',
  'master.intelligence.apds.availability.NOT_ACTIVATED',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE',
  'master.intelligence.apds.realPoll.NOT_LINKED',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE',
] as const;

const localeDictionaries = [
  ['en', masterIntelligenceEn],
  ['de', masterIntelligenceDe],
  ['pl', masterIntelligencePl],
  ['fr', masterIntelligenceFr],
  ['cs', masterIntelligenceCs],
  ['nl', masterIntelligenceNl],
  ['es', masterIntelligenceEs],
  ['tr', masterIntelligenceTr],
  ['it', masterIntelligenceIt],
] as const;

describe('APDS Master Intelligence i18n', () => {
  it('defines presentation and real-poll link keys in all nine locales', () => {
    for (const [code, dict] of localeDictionaries) {
      for (const key of APDS_PRESENTATION_KEYS) {
        expect(dict[key], `${code}:${key}`).toBeTruthy();
      }
    }
  });
});

describe('APDS Master Intelligence URL context', () => {
  const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
  const vehicle = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
  const link = '9ff5e350-cd4b-4e3a-956a-4f1770b017f2';
  const opportunity = 'opp-full-id-for-detail-api';
  const policy = 'P25_APD_B2_V1';

  it('round-trips decision detail params for APDS view', () => {
    const qs = buildMasterIntelligenceSearch('apds-intelligence', {
      ...emptyIntelligenceContext(),
      orgId: org,
      vehicleId: vehicle,
      providerSourceLinkId: link,
      apdOpportunityId: opportunity,
      policyVersion: policy,
      asOf: '2026-10-28T10:00:00.000Z',
    });
    const ctx = parseMasterIntelligenceContext(`?${qs.replace(/^\?/, '')}`);
    expect(ctx.apdOpportunityId).toBe(opportunity);
    expect(ctx.policyVersion).toBe(policy);
    expect(ctx.asOf).toBe('2026-10-28T10:00:00.000Z');
  });
});
