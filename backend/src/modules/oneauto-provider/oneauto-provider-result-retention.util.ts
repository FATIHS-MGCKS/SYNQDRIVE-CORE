/**
 * Provider-published async result retention for OE_VIN_LOOKUP_EU (One Auto KB).
 * Assumption: up to 24 hours to re-request a completed result after initial 202 acceptance.
 * Conservative default — not attested as charge-free re-query (`asyncPollSameUrlWithoutNewCharge` remains false).
 */
export const ONEAUTO_DEFAULT_PROVIDER_RESULT_RETENTION_MS = 24 * 60 * 60 * 1000;

export function computeOneAutoProviderResultExpiresAt(
  initialProviderDispatchAt: Date,
  retentionMs: number = ONEAUTO_DEFAULT_PROVIDER_RESULT_RETENTION_MS,
): Date {
  const ms = Number.isFinite(retentionMs) && retentionMs > 0
    ? retentionMs
    : ONEAUTO_DEFAULT_PROVIDER_RESULT_RETENTION_MS;
  return new Date(initialProviderDispatchAt.getTime() + ms);
}

export function isOneAutoAsyncCapableWithoutVerifiedPoll(
  contract: { asyncPollSameUrlWithoutNewCharge: boolean; asyncCapability: string; catalogExecutionMode: string },
): boolean {
  if (contract.asyncPollSameUrlWithoutNewCharge) return false;
  return contract.asyncCapability === 'ASYNC_CAPABLE' || contract.catalogExecutionMode === 'ASYNC_CAPABLE';
}
