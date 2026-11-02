import {
  getDocumentedOneAutoContract,
  isOneAutoSkuDocumented,
} from './oneauto-documented-contracts';
import type { OneAutoExecutionVerifiedProviderContract } from './oneauto-contract-types';

export type {
  OneAutoDocumentedProviderContract,
  OneAutoExecutionVerifiedProviderContract,
  OneAutoProviderHttpContract,
} from './oneauto-contract-types';

/** @deprecated Use OneAutoExecutionVerifiedProviderContract — alias for P1 import sites. */
export type VerifiedOneAutoProviderContract = OneAutoExecutionVerifiedProviderContract;

/**
 * Execution-verified registry — empty until async/billing attestation PRs land.
 * DOCUMENTED contracts alone must never be inserted here.
 */
export const ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS: Map<
  string,
  OneAutoExecutionVerifiedProviderContract
> = new Map();

/** Back-compat alias (same map reference). */
export const ONEAUTO_VERIFIED_PROVIDER_CONTRACTS = ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS;

export function getExecutionVerifiedOneAutoContract(
  serviceSku: string,
): OneAutoExecutionVerifiedProviderContract | undefined {
  return ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.get(serviceSku);
}

/** @deprecated Prefer getExecutionVerifiedOneAutoContract */
export function getVerifiedOneAutoContract(
  serviceSku: string,
): OneAutoExecutionVerifiedProviderContract | undefined {
  return getExecutionVerifiedOneAutoContract(serviceSku);
}

export function isOneAutoSkuExecutionVerified(serviceSku: string): boolean {
  return ONEAUTO_EXECUTION_VERIFIED_PROVIDER_CONTRACTS.has(serviceSku);
}

/** @deprecated Prefer isOneAutoSkuExecutionVerified */
export function isOneAutoSkuContractVerified(serviceSku: string): boolean {
  return isOneAutoSkuExecutionVerified(serviceSku);
}

export type OneAutoContractGateField =
  | 'endpoint'
  | 'httpMethod'
  | 'vinParameter'
  | 'asyncSemantics'
  | 'asyncPollBilling'
  | 'http206Semantics'
  | 'price'
  | 'responseParsing';

export type OneAutoContractGateReason =
  | 'CONTRACT_UNVERIFIED'
  | 'DOCUMENTED_NOT_EXECUTABLE'
  | 'EXECUTABLE';

export type OneAutoContractGateReport = {
  serviceSku: string;
  executable: boolean;
  reason: OneAutoContractGateReason;
  documentationState: 'DOCUMENTED' | 'UNVERIFIED';
  executionVerificationState: 'EXECUTION_VERIFIED' | 'UNVERIFIED';
  unverifiedFields: OneAutoContractGateField[];
};

export function buildOneAutoContractGateReport(serviceSku: string): OneAutoContractGateReport {
  const execution = getExecutionVerifiedOneAutoContract(serviceSku);
  if (execution) {
    return {
      serviceSku,
      executable: true,
      reason: 'EXECUTABLE',
      documentationState: isOneAutoSkuDocumented(serviceSku) ? 'DOCUMENTED' : 'UNVERIFIED',
      executionVerificationState: 'EXECUTION_VERIFIED',
      unverifiedFields: [],
    };
  }

  const documented = getDocumentedOneAutoContract(serviceSku);
  if (documented) {
    return {
      serviceSku,
      executable: false,
      reason: 'DOCUMENTED_NOT_EXECUTABLE',
      documentationState: 'DOCUMENTED',
      executionVerificationState: 'UNVERIFIED',
      unverifiedFields: [
        'asyncPollBilling',
        'http206Semantics',
        'price',
        'responseParsing',
        ...(documented.asyncCapability === 'ASYNC_UNVERIFIED' ? (['asyncSemantics'] as const) : []),
      ],
    };
  }

  return {
    serviceSku,
    executable: false,
    reason: 'CONTRACT_UNVERIFIED',
    documentationState: 'UNVERIFIED',
    executionVerificationState: 'UNVERIFIED',
    unverifiedFields: [
      'endpoint',
      'httpMethod',
      'vinParameter',
      'asyncSemantics',
      'asyncPollBilling',
      'http206Semantics',
      'price',
      'responseParsing',
    ],
  };
}
