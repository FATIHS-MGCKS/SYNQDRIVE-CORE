import type { Fsd3CatalogStageCheckpointV1 } from './fsd3-request-ledger.v1';

/** Persisted successful catalog fetch — empty `availableSignalNames` is valid evidence. */
export function hasPersistedFsdCatalogFetchV1(
  catalogFetch: Fsd3CatalogStageCheckpointV1['catalogFetch'] | undefined,
): catalogFetch is NonNullable<Fsd3CatalogStageCheckpointV1['catalogFetch']> & {
  succeeded: true;
  availableSignalNames: string[];
} {
  return (
    catalogFetch?.succeeded === true && Array.isArray(catalogFetch.availableSignalNames)
  );
}
