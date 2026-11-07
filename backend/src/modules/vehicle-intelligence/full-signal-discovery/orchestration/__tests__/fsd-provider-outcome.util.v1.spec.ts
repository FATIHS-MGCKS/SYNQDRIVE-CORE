import type { FsdGraphqlResponseInterpretationV1 } from '../../fsd-response.interpreter.v1';
import {
  classifyFsd3CatalogProviderLedgerOutcomeV1,
  classifyFsd3SnapshotDocumentLedgerOutcomeV1,
  classifyFsd4HistoricalDocumentLedgerOutcomeV1,
} from '../fsd-provider-outcome.util.v1';

function okInterpreted(fieldNames: string[]): FsdGraphqlResponseInterpretationV1 {
  return {
    documentAccepted: true,
    fields: fieldNames.map((fieldName) => ({
      fieldName,
      attribution: 'RELIABLE' as const,
      evidence: {
        declared: true,
        schemaCompatible: true,
        queryPlanned: true,
        queryAccepted: true,
      },
    })),
  };
}

describe('fsd-provider-outcome.util.v1 (ledger classification)', () => {
  const fields = ['speed'];
  const interpretedOk = okInterpreted(fields);

  describe('classifyFsd3CatalogProviderLedgerOutcomeV1', () => {
    it('succeeds for HTTP_200_OK + empty catalog list', () => {
      expect(
        classifyFsd3CatalogProviderLedgerOutcomeV1({
          availableSignals: [],
          httpStatus: 200,
          catalogFetchSucceeded: true,
          providerOutcomeKind: 'HTTP_200_OK',
        }),
      ).toEqual({ ledgerOutcome: 'SUCCEEDED' });
    });

    it('unknown on HTTP_429 even when catalogFetchSucceeded contradicts', () => {
      expect(
        classifyFsd3CatalogProviderLedgerOutcomeV1({
          availableSignals: ['speed'],
          httpStatus: 429,
          catalogFetchSucceeded: true,
          providerOutcomeKind: 'HTTP_429',
        }),
      ).toEqual({ ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' });
    });

    it('unknown on HTTP_5XX even when catalogFetchSucceeded contradicts', () => {
      expect(
        classifyFsd3CatalogProviderLedgerOutcomeV1({
          availableSignals: ['speed'],
          httpStatus: 503,
          catalogFetchSucceeded: true,
          providerOutcomeKind: 'HTTP_5XX',
        }),
      ).toEqual({ ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' });
    });

    it('failed on HTTP_200_OK + catalogFetchSucceeded false', () => {
      expect(
        classifyFsd3CatalogProviderLedgerOutcomeV1({
          availableSignals: [],
          httpStatus: 200,
          catalogFetchSucceeded: false,
          providerOutcomeKind: 'HTTP_200_OK',
        }),
      ).toEqual({ ledgerOutcome: 'FAILED' });
    });

    it('failed on malformed catalog classified outcome', () => {
      expect(
        classifyFsd3CatalogProviderLedgerOutcomeV1({
          availableSignals: [],
          httpStatus: 200,
          catalogFetchSucceeded: false,
          providerOutcomeKind: 'MALFORMED_RESPONSE',
        }),
      ).toEqual({ ledgerOutcome: 'FAILED' });
    });

    it('legacy mock succeeds without providerOutcomeKind', () => {
      expect(
        classifyFsd3CatalogProviderLedgerOutcomeV1({
          availableSignals: ['speed'],
          httpStatus: 200,
        }),
      ).toEqual({ ledgerOutcome: 'SUCCEEDED' });
    });
  });

  describe('classifyFsd3SnapshotDocumentLedgerOutcomeV1', () => {
    it('never succeeds on HTTP_429 classified kind', () => {
      const r = classifyFsd3SnapshotDocumentLedgerOutcomeV1(
        {
          documentFingerprint: 'fp',
          fieldNamesInDocument: fields,
          dataPresent: true,
          httpStatus: 429,
          providerOutcomeKind: 'HTTP_429',
          errors: [],
        },
        interpretedOk,
      );
      expect(r).toEqual({ ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' });
    });

    it('fails closed on HTTP_401', () => {
      expect(
        classifyFsd3SnapshotDocumentLedgerOutcomeV1(
          {
            documentFingerprint: 'fp',
            fieldNamesInDocument: fields,
            dataPresent: false,
            httpStatus: 401,
            providerOutcomeKind: 'HTTP_401',
            errors: [],
          },
          interpretedOk,
        ),
      ).toEqual({ ledgerOutcome: 'FAILED' });
    });

    it('succeeds only for HTTP_200_OK with data and legacy success', () => {
      expect(
        classifyFsd3SnapshotDocumentLedgerOutcomeV1(
          {
            documentFingerprint: 'fp',
            fieldNamesInDocument: fields,
            dataPresent: true,
            httpStatus: 200,
            providerOutcomeKind: 'HTTP_200_OK',
            errors: [],
          },
          interpretedOk,
        ),
      ).toEqual({ ledgerOutcome: 'SUCCEEDED' });
    });

    it('UNKNOWN for GRAPHQL_ERRORS_NO_DATA', () => {
      expect(
        classifyFsd3SnapshotDocumentLedgerOutcomeV1(
          {
            documentFingerprint: 'fp',
            fieldNamesInDocument: fields,
            dataPresent: false,
            httpStatus: 200,
            providerOutcomeKind: 'GRAPHQL_ERRORS_NO_DATA',
            errors: [{ message: 'x' }],
          },
          interpretedOk,
        ),
      ).toEqual({ ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' });
    });
  });

  describe('classifyFsd4HistoricalDocumentLedgerOutcomeV1', () => {
    it('never succeeds on MALFORMED_RESPONSE', () => {
      expect(
        classifyFsd4HistoricalDocumentLedgerOutcomeV1(
          {
            documentFingerprint: 'fp',
            fieldNamesInDocument: fields,
            dataPresent: false,
            httpStatus: 502,
            providerOutcomeKind: 'MALFORMED_RESPONSE',
            errors: [],
          },
          interpretedOk,
        ),
      ).toEqual({ ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' });
    });

    it('fails closed on HTTP_403', () => {
      expect(
        classifyFsd4HistoricalDocumentLedgerOutcomeV1(
          {
            documentFingerprint: 'fp',
            fieldNamesInDocument: fields,
            dataPresent: false,
            httpStatus: 403,
            providerOutcomeKind: 'HTTP_403',
            errors: [],
          },
          interpretedOk,
        ),
      ).toEqual({ ledgerOutcome: 'FAILED' });
    });

    it('succeeds for HTTP_200_PARTIAL_GRAPHQL_ERRORS with data and legacy success', () => {
      expect(
        classifyFsd4HistoricalDocumentLedgerOutcomeV1(
          {
            documentFingerprint: 'fp',
            fieldNamesInDocument: fields,
            dataPresent: true,
            httpStatus: 200,
            providerOutcomeKind: 'HTTP_200_PARTIAL_GRAPHQL_ERRORS',
            errors: [],
            observationsByField: { speed: [] },
          },
          interpretedOk,
        ),
      ).toEqual({ ledgerOutcome: 'SUCCEEDED' });
    });
  });
});
