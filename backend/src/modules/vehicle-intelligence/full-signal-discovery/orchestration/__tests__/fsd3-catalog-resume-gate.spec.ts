import { classifyFsd3CatalogReserveForProviderDispatch } from '../fsd3-request-ledger.v1';
import { hasPersistedFsdCatalogFetchV1 } from '../fsd-catalog-persist.util.v1';

describe('FSD3 catalog resume gate (empty catalog)', () => {
  it('SKIP_SETTLED with persisted empty catalog is resumable', () => {
    const checkpoint = {
      requestLedger: { budgetTotal: 4, attempts: [] },
      catalogFetch: {
        succeeded: true as const,
        availableSignalNames: [] as string[],
        declaredCatalogFingerprint: 'deadbeef',
      },
    };
    expect(hasPersistedFsdCatalogFetchV1(checkpoint.catalogFetch)).toBe(true);
    const ledger = { budgetTotal: 4, attempts: [] };
    const gate = classifyFsd3CatalogReserveForProviderDispatch({
      reserve: {
        kind: 'IDEMPOTENT',
        ledger,
        attempt: {
          attemptKey: 'catalog',
          queryFingerprint: 'catalog:availableSignals:v1',
          outcome: 'SUCCEEDED',
          reservedAt: '2026-11-07T00:00:00.000Z',
        },
      },
      checkpoint,
    });
    expect(gate).toEqual({ action: 'SKIP_SETTLED', reason: 'CATALOG_ALREADY_SUCCEEDED' });
  });
});
