import type { TireSpecCompactEvalCase } from './ai-tire-spec-compact-eval.types';

/**
 * Documented P2 cohort — synthetic public product identities only.
 * Ground truth lives here for eval scoring, not in the normalizer.
 */
export const TIRE_V3_COMPACT_EVAL_CASES: TireSpecCompactEvalCase[] = [
  {
    id: 'S1',
    category: 'summer',
    authoritativeIdentity: {
      brand: 'Michelin',
      model: 'Pilot Sport 4',
      tireSize: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    },
    setupTireSeason: 'SUMMER',
    reference: {
      seasonType: 'summer',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      sourceSummary: 'Michelin Pilot Sport 4 — public UHP summer line (no customer data).',
    },
  },
  {
    id: 'S2',
    category: 'summer',
    authoritativeIdentity: {
      brand: 'Continental',
      model: 'PremiumContact 6',
      tireSize: '205/55R16',
      loadIndex: '91',
      speedIndex: 'V',
    },
    setupTireSeason: 'SUMMER',
    reference: {
      seasonType: 'summer',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      sourceSummary: 'Continental PremiumContact 6 — public summer touring line.',
    },
  },
  {
    id: 'W1',
    category: 'winter',
    authoritativeIdentity: {
      brand: 'Continental',
      model: 'WinterContact TS 870',
      tireSize: '205/55R16',
      loadIndex: '91',
      speedIndex: 'H',
    },
    setupTireSeason: 'WINTER',
    reference: {
      seasonType: 'winter',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      severeSnowMarked: true,
      markEvidence: 'VERIFIED_LABEL',
      markVerificationStatus: 'AMBIGUOUS_PRODUCT_LINE',
      seasonNotes: 'Winter line; 3PMSF typical — not sidewall-confirmed in this audit.',
      sourceSummary: 'Continental WinterContact TS 870 — public dedicated winter product.',
    },
  },
  {
    id: 'W2',
    category: 'winter',
    authoritativeIdentity: {
      brand: 'Michelin',
      model: 'Alpin 6',
      tireSize: '225/45R17',
      loadIndex: '94',
      speedIndex: 'V',
    },
    setupTireSeason: 'WINTER',
    reference: {
      seasonType: 'winter',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      seasonNotes:
        'P2 simulated LLM all_season — product is winter; mismatch is LLM misclassification not reference ambiguity.',
      sourceSummary: 'Michelin Alpin 6 — public winter line (distinct from CrossClimate).',
    },
  },
  {
    id: 'A1',
    category: 'all_season',
    authoritativeIdentity: {
      brand: 'Goodyear',
      model: 'Vector 4Seasons Gen-3',
      tireSize: '225/45R17',
      loadIndex: '94',
      speedIndex: 'W',
    },
    setupTireSeason: 'ALL_SEASON',
    reference: {
      seasonType: 'all_season',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      sourceSummary: 'Goodyear Vector 4Seasons Gen-3 — public all-season line.',
    },
  },
  {
    id: 'A2',
    category: 'all_season',
    authoritativeIdentity: {
      brand: 'Michelin',
      model: 'CrossClimate 2',
      tireSize: '205/60R16',
      loadIndex: '96',
      speedIndex: 'H',
    },
    setupTireSeason: 'ALL_SEASON',
    reference: {
      seasonType: 'all_season',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'AMBIGUOUS_PRODUCT_LINE',
      seasonNotes:
        'CrossClimate marketed as all-season; some knowledge bases label as summer+3PMSF — P2 LLM summer is misclassification vs setup, reference slightly ambiguous.',
      sourceSummary: 'Michelin CrossClimate 2 — public all-season / cross-climate line.',
    },
  },
  {
    id: 'EV1',
    category: 'ev',
    authoritativeIdentity: {
      brand: 'Michelin',
      model: 'Pilot Sport EV',
      tireSize: '235/45R20',
      loadIndex: '100',
      speedIndex: 'Y',
    },
    setupTireSeason: 'SUMMER',
    reference: {
      seasonType: 'summer',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      evOptimized: true,
      markEvidence: 'VERIFIED_MANUFACTURER',
      markVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      sourceSummary: 'Michelin Pilot Sport EV — public EV-tuned UHP line.',
    },
  },
  {
    id: 'RF1',
    category: 'runflat_xl',
    authoritativeIdentity: {
      brand: 'Bridgestone',
      model: 'Turanza T005',
      tireSize: '225/45R17',
      loadIndex: '94',
      speedIndex: 'W',
    },
    setupTireSeason: 'SUMMER',
    reference: {
      seasonType: 'summer',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      runFlat: null,
      xl: null,
      markEvidence: 'UNKNOWN',
      markVerificationStatus: 'UNVERIFIED_IN_AUDIT',
      seasonNotes: 'RFT/XL variants exist; without sidewall photo marks are unverifiable.',
      sourceSummary: 'Bridgestone Turanza T005 — size/line public; RFT/XL not asserted in reference.',
    },
  },
  {
    id: 'VAR',
    category: 'variant_stress',
    authoritativeIdentity: {
      brand: 'Michelin',
      model: 'Pilot Sport 4',
      tireSize: '225/45R17',
      loadIndex: '94',
      speedIndex: 'Y',
    },
    setupTireSeason: 'SUMMER',
    reference: {
      seasonType: 'summer',
      seasonEvidence: 'VERIFIED_MANUFACTURER',
      seasonVerificationStatus: 'VERIFIED_PRODUCT_LINE',
      sourceSummary: 'Identity ground truth = authoritative ctx (variant drift stress case).',
    },
  },
];
