import {
  buildFsd3TeslaMockCatalogResultV1,
} from './fsd3-mock-provider.v1';
import type {
  Fsd4HistoricalDiscoveryProviderPortV1,
  Fsd4ProviderHistoricalResultV1,
} from './fsd4-provider.port.v1';
import {
  buildP2eObservationsForField,
  FSD4_MOCK_P2E_WINDOW_V1,
} from './fsd4-mock-p2e-historical.v1';
import { FSD_TESLA_P2E_DECLARED_FIELDS_V1 } from '../__fixtures__/fsd-p2e-tesla.fixture.v1';

export type Fsd4MockProviderModeV1 =
  | 'TESLA_P2E_HISTORICAL'
  | 'PARTIAL_GRAPHQL_ERRORS'
  | 'AMBIGUOUS_GRAPHQL_ERRORS'
  | 'HTTP_422_DOCUMENT'
  | 'CATALOG_HTTP_500';

export function createFsd4MockHistoricalProvider(input: {
  mode: Fsd4MockProviderModeV1;
  historicalWindow?: typeof FSD4_MOCK_P2E_WINDOW_V1;
  duplicateFirstSpeedTimestamp?: boolean;
}): Fsd4HistoricalDiscoveryProviderPortV1 & {
  getCatalogCallCount(): number;
  getHistoricalCallCount(): number;
} {
  const window = input.historicalWindow ?? FSD4_MOCK_P2E_WINDOW_V1;
  let catalogCallCount = 0;
  let historicalCallCount = 0;
  const rejected = new Set<string>();

  return {
    providerKind: 'mock',
    async fetchAvailableSignals() {
      catalogCallCount += 1;
      if (input.mode === 'CATALOG_HTTP_500') {
        return { availableSignals: [], httpStatus: 500 };
      }
      return buildFsd3TeslaMockCatalogResultV1();
    },
    async executeHistoricalDocument(request): Promise<Fsd4ProviderHistoricalResultV1> {
      historicalCallCount += 1;
      if (rejected.has(request.documentFingerprint)) {
        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: false,
          httpStatus: 422,
        };
      }
      if (input.mode === 'HTTP_422_DOCUMENT') {
        rejected.add(request.documentFingerprint);
        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: false,
          httpStatus: 422,
        };
      }
      if (input.mode === 'AMBIGUOUS_GRAPHQL_ERRORS') {
        return {
          documentFingerprint: request.documentFingerprint,
          fieldNamesInDocument: request.fieldNamesInDocument,
          dataPresent: false,
          httpStatus: 200,
          errors: [{ message: 'ambiguous' }],
        };
      }
      const observationsByField: Record<string, ReturnType<typeof buildP2eObservationsForField>> = {};
      for (const fieldName of request.fieldNamesInDocument) {
        if (input.mode === 'PARTIAL_GRAPHQL_ERRORS' && fieldName === 'exteriorAirTemperature') {
          continue;
        }
        if (!FSD_TESLA_P2E_DECLARED_FIELDS_V1.includes(fieldName as never)) {
          continue;
        }
        observationsByField[fieldName] = buildP2eObservationsForField({
          window,
          fieldName,
          duplicateFirstTimestamp:
            input.duplicateFirstSpeedTimestamp && fieldName === 'speed' && historicalCallCount === 1,
        });
      }
      const errors =
        input.mode === 'PARTIAL_GRAPHQL_ERRORS' &&
        request.fieldNamesInDocument.includes('exteriorAirTemperature')
          ? [{ path: ['signals', 'exteriorAirTemperature'], message: 'field failed' }]
          : [];
      return {
        documentFingerprint: request.documentFingerprint,
        fieldNamesInDocument: request.fieldNamesInDocument,
        dataPresent: true,
        httpStatus: 200,
        errors,
        observationsByField,
      };
    },
    getCatalogCallCount() {
      return catalogCallCount;
    },
    getHistoricalCallCount() {
      return historicalCallCount;
    },
  };
}

export function createFsd4LiveStubHistoricalProvider(): Fsd4HistoricalDiscoveryProviderPortV1 {
  return {
    providerKind: 'live',
    async fetchAvailableSignals() {
      return { availableSignals: [], httpStatus: 503 };
    },
    async executeHistoricalDocument() {
      return {
        documentFingerprint: '',
        fieldNamesInDocument: [],
        dataPresent: false,
        httpStatus: 503,
      };
    },
  };
}
