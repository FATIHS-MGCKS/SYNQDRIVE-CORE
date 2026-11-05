import {
  FSD_P2E_AGGREGATE_EXPECTATIONS_V1,
  FSD_TESLA_P2E_DECLARED_FIELDS_V1,
} from '../__fixtures__/fsd-p2e-tesla.fixture.v1';
import type {
  Fsd3DiscoveryProviderPortV1,
  Fsd3ProviderCatalogResultV1,
  Fsd3ProviderSnapshotFieldValueV1,
  Fsd3ProviderSnapshotResultV1,
} from './fsd3-provider.port.v1';

export type Fsd3MockProviderModeV1 =
  | 'TESLA_REFERENCE_26'
  | 'LARGE_CATALOG_300'
  | 'PARTIAL_GRAPHQL_ERRORS'
  | 'AMBIGUOUS_GRAPHQL_ERRORS'
  | 'HTTP_422_DOCUMENT';

export function buildFsd3TeslaMockCatalogResultV1(): Fsd3ProviderCatalogResultV1 {
  return {
    availableSignals: [...FSD_TESLA_P2E_DECLARED_FIELDS_V1],
    httpStatus: 200,
  };
}

export function buildFsd3TeslaMockSnapshotValues(): Record<
  string,
  { kind: 'VALID_NONZERO' | 'VALID_ZERO' | 'NULL' | 'MISSING'; numericValue?: number | null }
> {
  const values: Record<
    string,
    { kind: 'VALID_NONZERO' | 'VALID_ZERO' | 'NULL' | 'MISSING'; numericValue?: number | null }
  > = {};
  for (const field of FSD_TESLA_P2E_DECLARED_FIELDS_V1) {
    if (field === FSD_P2E_AGGREGATE_EXPECTATIONS_V1.nullOnlySignal) {
      values[field] = { kind: 'NULL', numericValue: null };
    } else {
      values[field] = { kind: 'VALID_NONZERO', numericValue: 1 };
    }
  }
  return values;
}

export function createFsd3MockDiscoveryProvider(input: {
  mode: Fsd3MockProviderModeV1;
  catalogSignals?: readonly string[];
  catalogDelayMs?: number;
  snapshotDelayMs?: number;
}): Fsd3DiscoveryProviderPortV1 {
  const catalog =
    input.mode === 'LARGE_CATALOG_300'
      ? Array.from({ length: 300 }, (_, i) => `fsdSyntheticFloat${String(i + 1).padStart(4, '0')}`)
      : input.catalogSignals ?? buildFsd3TeslaMockCatalogResultV1().availableSignals;

  const teslaValues = buildFsd3TeslaMockSnapshotValues();
  const rejectedFingerprints = new Set<string>();
  let snapshotCallCount = 0;

  return {
    async fetchAvailableSignals(): Promise<Fsd3ProviderCatalogResultV1> {
      if (input.catalogDelayMs && input.catalogDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, input.catalogDelayMs));
      }
      return { availableSignals: catalog, httpStatus: 200 };
    },
    async executeSnapshotDocument(request): Promise<Fsd3ProviderSnapshotResultV1> {
      snapshotCallCount += 1;
      if (input.snapshotDelayMs && input.snapshotDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, input.snapshotDelayMs));
      }
      if (rejectedFingerprints.has(request.documentFingerprint)) {
        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: false,
          httpStatus: 422,
        };
      }
      if (input.mode === 'HTTP_422_DOCUMENT') {
        rejectedFingerprints.add(request.documentFingerprint);
        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: false,
          httpStatus: 422,
        };
      }
      const valuesByField: Record<string, Fsd3ProviderSnapshotFieldValueV1> = {};
      for (const field of request.fieldNamesInDocument) {
        if (input.mode === 'PARTIAL_GRAPHQL_ERRORS' && field === 'speed') {
          continue;
        }
        const preset = teslaValues[field];
        valuesByField[field] = preset ?? { kind: 'MISSING' };
      }
      const errors =
        input.mode === 'PARTIAL_GRAPHQL_ERRORS' && request.fieldNamesInDocument.includes('speed')
          ? [{ message: 'field error', path: ['signals', 'speed'] }]
          : input.mode === 'AMBIGUOUS_GRAPHQL_ERRORS'
            ? [{ message: 'ambiguous failure' }]
            : [];
      return {
        documentFingerprint: request.documentFingerprint,
        fieldNamesInDocument: request.fieldNamesInDocument,
        dataPresent: input.mode !== 'AMBIGUOUS_GRAPHQL_ERRORS',
        httpStatus: 200,
        errors,
        valuesByField,
      };
    },
    getSnapshotCallCount(): number {
      return snapshotCallCount;
    },
  } as Fsd3DiscoveryProviderPortV1 & { getSnapshotCallCount(): number };
}
