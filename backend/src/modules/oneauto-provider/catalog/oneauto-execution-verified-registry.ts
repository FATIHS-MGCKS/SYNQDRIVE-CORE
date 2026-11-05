import { getDocumentedOneAutoContract } from './oneauto-documented-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './oneauto-contract-types';

/** Env `ONEAUTO_PRICING_CATALOG_VERSION` must match at execute time when using default indicative prices. */
export const ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION =
  'synqdrive-p4-vin-lookup-async-capable-v1' as const;

/** E1 Service History EU — DE PrePay reference 300 EUR minor; account billing still operator-verified. */
export const ONEAUTO_E1_SERVICE_HISTORY_EU_PRICING_SOURCE_VERSION =
  'synqdrive-e1-service-history-eu-callback-v1' as const;

/** @deprecated Renamed in P4 contract correction — use `ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION`. */
export const ONEAUTO_P3_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION =
  ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION;

const P4_VIN_LOOKUP_EVIDENCE_SOURCES = [
  'architecture/oneauto-provider/evidence/P25E_E2_PROVIDER_DASHBOARD_ASYNC_SEQUENCE.md',
  'architecture/oneauto-provider/evidence/P25E_P1_SECURE_RESULT_CAPTURE.md',
  'architecture/oneauto-provider/evidence/P3_VIN_LOOKUP_EXECUTION_VERIFIED.md',
  'architecture/oneauto-provider/evidence/P4_VIN_LOOKUP_ASYNC_CONTRACT_CORRECTION.md',
  'architecture/oneauto-provider/evidence/P4_CROSS_VEHICLE_ROOT_CAUSE.md',
] as const;

/** Base async-capable contract without callback completion (tests / historical builder). */
export function buildExecutionVerifiedOeVinLookupEu(): OneAutoExecutionVerifiedProviderContract {
  const documented = getDocumentedOneAutoContract('OE_VIN_LOOKUP_EU');
  if (!documented) {
    throw new Error('OE_VIN_LOOKUP_EU documented contract missing');
  }
  return {
    ...documented,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    asyncCompletionMode: 'NONE',
    catalogExecutionMode: 'ASYNC_CAPABLE',
    asyncCapability: 'ASYNC_CAPABLE',
    pricingSourceVersion: ONEAUTO_P4_VIN_LOOKUP_EU_PRICING_SOURCE_VERSION,
    evidenceSources: [...documented.evidenceSources, ...P4_VIN_LOOKUP_EVIDENCE_SOURCES],
  };
}

/** E4 full-data callback completion — seeded in execution-verified registry (activation still gated by env flags). */
export function buildExecutionVerifiedOeVinLookupEuFullDataCallback(): OneAutoExecutionVerifiedProviderContract {
  return {
    ...buildExecutionVerifiedOeVinLookupEu(),
    asyncCompletionMode: 'CALLBACK_FULL_DATA',
  };
}

const E1_SERVICE_HISTORY_EVIDENCE_SOURCES = [
  'architecture/oneauto-provider/evidence/E1_SERVICE_HISTORY_EU_CALLBACK_V1.md',
] as const;

export function buildExecutionVerifiedOeServiceHistoryEu(): OneAutoExecutionVerifiedProviderContract {
  const documented = getDocumentedOneAutoContract('OE_SERVICE_HISTORY_EU');
  if (!documented) {
    throw new Error('OE_SERVICE_HISTORY_EU documented contract missing');
  }
  return {
    ...documented,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    asyncCompletionMode: 'NONE',
    catalogExecutionMode: 'ASYNC_CAPABLE',
    asyncCapability: 'ASYNC_CAPABLE',
    pricingSourceVersion: ONEAUTO_E1_SERVICE_HISTORY_EU_PRICING_SOURCE_VERSION,
    evidenceSources: [...documented.evidenceSources, ...E1_SERVICE_HISTORY_EVIDENCE_SOURCES],
  };
}

export function buildExecutionVerifiedOeServiceHistoryEuFullDataCallback(): OneAutoExecutionVerifiedProviderContract {
  return {
    ...buildExecutionVerifiedOeServiceHistoryEu(),
    asyncCompletionMode: 'CALLBACK_FULL_DATA',
  };
}

/** DE PrePay reference 210 EUR minor; account billing still operator-verified. */
export const ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION =
  'synqdrive-oe-service-schedule-eu-callback-v1' as const;

const OE_SERVICE_SCHEDULE_EVIDENCE_SOURCES = [
  'architecture/oneauto-provider/evidence/P1_OE_SERVICE_SCHEDULE_INTEGRATION_DRAFT.md',
  'architecture/oneauto-provider/evidence/OE_SERVICE_SCHEDULE_EU_EXECUTION_ACTIVATION.md',
] as const;

export function buildExecutionVerifiedOeServiceScheduleEu(): OneAutoExecutionVerifiedProviderContract {
  const documented = getDocumentedOneAutoContract('OE_SERVICE_SCHEDULE');
  if (!documented) {
    throw new Error('OE_SERVICE_SCHEDULE documented contract missing');
  }
  return {
    ...documented,
    evidenceState: 'EXECUTION_VERIFIED',
    asyncPollSameUrlWithoutNewCharge: false,
    http206CompleteSuccessAllowed: false,
    asyncCompletionMode: 'NONE',
    catalogExecutionMode: 'ASYNC_CAPABLE',
    asyncCapability: 'ASYNC_CAPABLE',
    pricingSourceVersion: ONEAUTO_OE_SERVICE_SCHEDULE_EU_PRICING_SOURCE_VERSION,
    evidenceSources: [...documented.evidenceSources, ...OE_SERVICE_SCHEDULE_EVIDENCE_SOURCES],
  };
}

export function buildExecutionVerifiedOeServiceScheduleEuFullDataCallback(): OneAutoExecutionVerifiedProviderContract {
  return {
    ...buildExecutionVerifiedOeServiceScheduleEu(),
    asyncCompletionMode: 'CALLBACK_FULL_DATA',
  };
}

/**
 * @deprecated Prefer `buildExecutionVerifiedOeServiceScheduleEuFullDataCallback` (P2 canary alias retained for imports).
 */
export function buildExecutionVerifiedOeServiceScheduleEuFullDataCallbackForAttestationOnly(): OneAutoExecutionVerifiedProviderContract {
  return buildExecutionVerifiedOeServiceScheduleEuFullDataCallback();
}

export const ONEAUTO_EXECUTION_VERIFIED_SKUS_READONLY = [
  'OE_VIN_LOOKUP_EU',
  'OE_SERVICE_HISTORY_EU',
  'OE_SERVICE_SCHEDULE',
] as const;

export function seedOneAutoExecutionVerifiedRegistry(
  target: Map<string, OneAutoExecutionVerifiedProviderContract>,
): void {
  target.clear();
  target.set('OE_VIN_LOOKUP_EU', buildExecutionVerifiedOeVinLookupEuFullDataCallback());
  target.set('OE_SERVICE_HISTORY_EU', buildExecutionVerifiedOeServiceHistoryEuFullDataCallback());
  target.set('OE_SERVICE_SCHEDULE', buildExecutionVerifiedOeServiceScheduleEuFullDataCallback());
}
