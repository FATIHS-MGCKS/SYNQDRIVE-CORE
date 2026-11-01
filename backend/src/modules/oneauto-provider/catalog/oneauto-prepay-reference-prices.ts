/**
 * Public DE PrePay reference prices (EUR minor units, VAT excluded).
 * Source: https://www.oneautoapi.com/pricing/de/ (PrePay column) and service pages where noted.
 *
 * These values are **not** loaded into runtime quotes automatically.
 * Operators must configure ONEAUTO_INDICATIVE_PRICE_<SKU>_MINOR after account-specific billing verification.
 */
export type OneAutoPrepayReferencePrice = {
  serviceSku: string;
  currency: 'EUR';
  prepayMinor: number | null;
  pricingPlan: 'PREPAY';
  vatExcluded: true;
  sourceUrl: string;
  note?: string;
};

export const ONEAUTO_DE_PREPAY_REFERENCE_PRICES: readonly OneAutoPrepayReferencePrice[] = [
  {
    serviceSku: 'OE_SERVICE_HISTORY_EU',
    currency: 'EUR',
    prepayMinor: 300,
    pricingPlan: 'PREPAY',
    vatExcluded: true,
    sourceUrl: 'https://www.oneautoapi.com/pricing/de/',
  },
  {
    serviceSku: 'OE_SERVICE_SCHEDULE',
    currency: 'EUR',
    prepayMinor: 210,
    pricingPlan: 'PREPAY',
    vatExcluded: true,
    sourceUrl: 'https://www.oneautoapi.com/pricing/de/',
  },
  {
    serviceSku: 'OE_BUILD_DECODE',
    currency: 'EUR',
    prepayMinor: 180,
    pricingPlan: 'PREPAY',
    vatExcluded: true,
    sourceUrl: 'https://www.oneautoapi.com/pricing/de/',
  },
  {
    serviceSku: 'OE_BUILD_SHEET_EU',
    currency: 'EUR',
    prepayMinor: 195,
    pricingPlan: 'PREPAY',
    vatExcluded: true,
    sourceUrl: 'https://www.oneautoapi.com/pricing/de/',
  },
  {
    serviceSku: 'OE_VIN_LOOKUP_EU',
    currency: 'EUR',
    prepayMinor: 36,
    pricingPlan: 'PREPAY',
    vatExcluded: true,
    sourceUrl: 'https://www.oneautoapi.com/pricing/de/',
  },
  {
    serviceSku: 'RECALL_CHECK',
    currency: 'EUR',
    prepayMinor: null,
    pricingPlan: 'PREPAY',
    vatExcluded: true,
    sourceUrl: 'https://www.oneautoapi.com/service/recall-check-vin/',
    note: 'UNVERIFIED on DE pricing table; service page lists PAYG/Business EUR separately',
  },
] as const;
