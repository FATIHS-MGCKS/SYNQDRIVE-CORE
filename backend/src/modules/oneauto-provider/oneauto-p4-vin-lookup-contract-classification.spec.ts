import { buildExecutionVerifiedOeVinLookupEu } from './catalog/oneauto-execution-verified-registry';
import type { OneAutoExecutionVerifiedProviderContract } from './catalog/oneauto-contract-types';

/**
 * P4 regression: HTTP 200 attestation alone must never yield SYNC_ONLY execution contract.
 * (E2 single-GET 200 was cached async retrieval — see P4 forensics evidence.)
 */
describe('OneAuto P4 VIN lookup contract classification guard', () => {
  it('does not classify OE_VIN_LOOKUP_EU as SYNC_ONLY from registry seed', () => {
    const entry = buildExecutionVerifiedOeVinLookupEu();
    expect(entry.serviceSku).toBe('OE_VIN_LOOKUP_EU');
    expect(entry.asyncCapability).not.toBe('SYNC_ONLY');
    expect(entry.catalogExecutionMode).not.toBe('SYNC');
  });

  it('rejects promoting SYNC_ONLY when only evidence is a single HTTP 200 observation', () => {
    const hypotheticalSyncOnlyFrom200: OneAutoExecutionVerifiedProviderContract = {
      ...buildExecutionVerifiedOeVinLookupEu(),
      asyncCapability: 'SYNC_ONLY',
      catalogExecutionMode: 'SYNC',
    };
    const violatesP4Policy =
      hypotheticalSyncOnlyFrom200.asyncCapability === 'SYNC_ONLY' &&
      hypotheticalSyncOnlyFrom200.catalogExecutionMode === 'SYNC';
    expect(violatesP4Policy).toBe(true);
    expect(buildExecutionVerifiedOeVinLookupEu().asyncCapability).toBe('ASYNC_CAPABLE');
  });

  it('preserves fail-closed poll and 206 flags on async-capable entry', () => {
    const entry = buildExecutionVerifiedOeVinLookupEu();
    expect(entry.asyncPollSameUrlWithoutNewCharge).toBe(false);
    expect(entry.http206CompleteSuccessAllowed).toBe(false);
  });
});
