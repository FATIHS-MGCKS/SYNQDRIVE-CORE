import type { FsdDimoGraphqlOutcomeKindV1 } from '@modules/dimo/fsd-dimo-graphql-result';
import type { FsdGraphqlErrorV1 } from '../fsd-response.interpreter.v1';
import type { FsdValueObservationKindV1 } from '../fsd-evidence.contract.v1';
import type { FsdDiscoveryRunIdentityV1 } from '../persistence/fsd-discovery-persistence.contract.v1';

export type Fsd3ProviderCatalogResultV1 = {
  availableSignals: readonly string[];
  httpStatus: number;
  /**
   * Live DIMO: false when HTTP/GraphQL did not yield a valid catalog (e.g. GRAPHQL_ERRORS_NO_DATA).
   * Undefined means success if httpStatus is 200 and availableSignals is an array (mock compatibility).
   */
  catalogFetchSucceeded?: boolean;
  providerOutcomeKind?: FsdDimoGraphqlOutcomeKindV1;
  providerDiagnostic?: string;
};

export type Fsd3ProviderSnapshotFieldValueV1 = {
  kind: FsdValueObservationKindV1;
  numericValue?: number | null;
};

export type Fsd3ProviderSnapshotResultV1 = {
  documentFingerprint: string;
  fieldNamesInDocument: readonly string[];
  dataPresent: boolean;
  httpStatus?: number;
  /** When set (live DIMO path), orchestrators use classified outcome instead of inferring from httpStatus only. */
  providerOutcomeKind?: FsdDimoGraphqlOutcomeKindV1;
  providerDiagnostic?: string;
  errors?: readonly FsdGraphqlErrorV1[];
  valuesByField?: Readonly<Record<string, Fsd3ProviderSnapshotFieldValueV1>>;
};

export type Fsd3ProviderKindV1 = 'mock' | 'live';

export type Fsd3DiscoveryProviderPortV1 = {
  providerKind: Fsd3ProviderKindV1;
  fetchAvailableSignals(input: {
    tokenId: number;
    dispatchContext?: FsdDiscoveryRunIdentityV1;
  }): Promise<Fsd3ProviderCatalogResultV1>;
  executeSnapshotDocument(input: {
    tokenId: number;
    queryText: string;
    documentFingerprint: string;
    fieldNamesInDocument: readonly string[];
    dispatchContext?: FsdDiscoveryRunIdentityV1;
  }): Promise<Fsd3ProviderSnapshotResultV1>;
};
