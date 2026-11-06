import type { FsdGraphqlErrorV1 } from '../fsd-response.interpreter.v1';

export type Fsd4HistoricalObservationV1 = {
  timestampMs: number;
  numericValue?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type Fsd4ProviderCatalogResultV1 = {
  availableSignals: readonly string[];
  httpStatus: number;
};

export type Fsd4ProviderHistoricalResultV1 = {
  documentFingerprint: string;
  fieldNamesInDocument: readonly string[];
  dataPresent: boolean;
  httpStatus: number;
  errors?: readonly FsdGraphqlErrorV1[];
  observationsByField?: Readonly<Record<string, readonly Fsd4HistoricalObservationV1[]>>;
};

export type Fsd4ProviderKindV1 = 'mock' | 'live';

export type Fsd4HistoricalDiscoveryProviderPortV1 = {
  providerKind: Fsd4ProviderKindV1;
  fetchAvailableSignals(input: { tokenId: number }): Promise<Fsd4ProviderCatalogResultV1>;
  executeHistoricalDocument(input: {
    tokenId: number;
    queryText: string;
    documentFingerprint: string;
    fieldNamesInDocument: readonly string[];
  }): Promise<Fsd4ProviderHistoricalResultV1>;
};
