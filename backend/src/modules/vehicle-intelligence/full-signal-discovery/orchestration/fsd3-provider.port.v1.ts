import type { FsdGraphqlErrorV1 } from '../fsd-response.interpreter.v1';
import type { FsdValueObservationKindV1 } from '../fsd-evidence.contract.v1';

export type Fsd3ProviderCatalogResultV1 = {
  availableSignals: readonly string[];
  httpStatus: number;
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
  errors?: readonly FsdGraphqlErrorV1[];
  valuesByField?: Readonly<Record<string, Fsd3ProviderSnapshotFieldValueV1>>;
};

export type Fsd3ProviderKindV1 = 'mock' | 'live';

export type Fsd3DiscoveryProviderPortV1 = {
  providerKind: Fsd3ProviderKindV1;
  fetchAvailableSignals(input: { tokenId: number }): Promise<Fsd3ProviderCatalogResultV1>;
  executeSnapshotDocument(input: {
    tokenId: number;
    queryText: string;
    documentFingerprint: string;
    fieldNamesInDocument: readonly string[];
  }): Promise<Fsd3ProviderSnapshotResultV1>;
};
