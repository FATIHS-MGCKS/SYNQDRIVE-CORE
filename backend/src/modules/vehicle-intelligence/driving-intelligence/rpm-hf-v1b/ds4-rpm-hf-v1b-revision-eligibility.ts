import type { Ds4RpmHfV1aTripInputV1 } from '../rpm-hf-v1a/ds4-rpm-hf-v1a.contract';

/**
 * Automatic input-revision reopen requires the same authoritative admission shape as a fresh SUCCESS persist:
 * RPM_1HZ trip classification, complete HF read, no transient V1A defer states.
 */
export function isTripInputEligibleForAutomaticRevision(tripInput: Ds4RpmHfV1aTripInputV1): boolean {
  if (tripInput.clickHouseRead.tenantScopeViolation) return false;
  const a = tripInput.admission;
  if (!a.processingAllowed || a.processingStatus !== 'ENABLED') return false;
  if (a.tripRpmProfile !== 'RPM_1HZ') return false;
  if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') return false;
  if (tripInput.clickHouseRead.status !== 'SUCCESS') return false;
  return true;
}

/** Tier-aware revision reopen only when authoritative tier row + HF are stable-success inputs. */
export function isTripInputEligibleForTierAwareAutomaticRevision(
  tripInput: Ds4RpmHfV1aTripInputV1,
): boolean {
  if (tripInput.clickHouseRead.tenantScopeViolation) return false;
  if (tripInput.dataQuality.completenessLabel !== 'COMPLETE') return false;
  if (tripInput.clickHouseRead.status !== 'SUCCESS') return false;
  if (tripInput.tierEvidence?.status !== 'AVAILABLE' || !tripInput.tierEvidence.tripClassification) {
    return false;
  }
  return true;
}
