import type { FsdDimoGraphqlOutcomeKindV1 } from '@modules/dimo/fsd-dimo-graphql-result';
import type { FsdGraphqlResponseInterpretationV1 } from '../fsd-response.interpreter.v1';
import type { Fsd3ProviderSnapshotResultV1 } from './fsd3-provider.port.v1';
import type { Fsd4ProviderHistoricalResultV1 } from './fsd4-provider.port.v1';

export type FsdDocumentProviderLedgerOutcomeV1 =
  | { ledgerOutcome: 'SUCCEEDED' }
  | { ledgerOutcome: 'FAILED'; stageOutcome?: 'UNKNOWN_OUTCOME' }
  | { ledgerOutcome: 'UNKNOWN'; stageOutcome: 'UNKNOWN_OUTCOME' };

/**
 * Ledger SUCCEEDED for a document request means the HTTP round-trip returned usable GraphQL data
 * (including HTTP 200 with field-level GraphQL errors). Per-field QUERY_FAILED is recorded from
 * `interpretFsdGraphqlProviderResponse`, not by failing the whole ledger attempt.
 */
function legacySnapshotDispatchSucceededV1(
  response: Fsd3ProviderSnapshotResultV1,
  _interpreted: FsdGraphqlResponseInterpretationV1,
): boolean {
  const http = response.httpStatus;
  if (http === 422 || http === 400) return false;
  if (http !== 200 || !response.dataPresent) return false;
  return true;
}

function legacyHistoricalDispatchSucceededV1(
  response: Fsd4ProviderHistoricalResultV1,
  _interpreted: FsdGraphqlResponseInterpretationV1,
): boolean {
  const http = response.httpStatus;
  if (http === 422 || http === 400) return false;
  if (http !== 200 || !response.dataPresent) return false;
  return true;
}

/**
 * Snapshot document: SUCCEEDED only for successful HTTP 200 GraphQL with data (including partial errors).
 */
export function classifyFsd3SnapshotDocumentLedgerOutcomeV1(
  response: Fsd3ProviderSnapshotResultV1,
  interpreted: FsdGraphqlResponseInterpretationV1,
): FsdDocumentProviderLedgerOutcomeV1 {
  const kind = response.providerOutcomeKind;
  if (kind != null) {
    if (
      (kind === 'HTTP_200_OK' || kind === 'HTTP_200_PARTIAL_GRAPHQL_ERRORS') &&
      response.dataPresent &&
      legacySnapshotDispatchSucceededV1(response, interpreted)
    ) {
      return { ledgerOutcome: 'SUCCEEDED' };
    }
    if (
      kind === 'HTTP_429' ||
      kind === 'HTTP_5XX' ||
      kind === 'TIMEOUT_OR_NETWORK_UNKNOWN' ||
      kind === 'MALFORMED_RESPONSE' ||
      kind === 'QUERY_FINGERPRINT_MISMATCH' ||
      kind === 'OVERSIZED_RESPONSE' ||
      kind === 'GRAPHQL_ERRORS_NO_DATA'
    ) {
      return { ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' };
    }
    if (kind === 'HTTP_401' || kind === 'HTTP_403' || kind === 'HTTP_400' || kind === 'HTTP_422') {
      return { ledgerOutcome: 'FAILED' };
    }
    return { ledgerOutcome: 'FAILED', stageOutcome: 'UNKNOWN_OUTCOME' };
  }

  const http = response.httpStatus;
  if (http === 422 || http === 400) {
    return { ledgerOutcome: 'FAILED' };
  }
  if (http === 401 || http === 403) {
    return { ledgerOutcome: 'FAILED' };
  }
  if (http === 429 || (typeof http === 'number' && http >= 500)) {
    return { ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' };
  }
  if (legacySnapshotDispatchSucceededV1(response, interpreted)) {
    return { ledgerOutcome: 'SUCCEEDED' };
  }
  if (http === 200 && !response.dataPresent) {
    return { ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' };
  }
  return { ledgerOutcome: 'FAILED' };
}

export function classifyFsd4HistoricalDocumentLedgerOutcomeV1(
  response: Fsd4ProviderHistoricalResultV1,
  interpreted: FsdGraphqlResponseInterpretationV1,
): FsdDocumentProviderLedgerOutcomeV1 {
  const kind = response.providerOutcomeKind;
  if (kind != null) {
    if (
      (kind === 'HTTP_200_OK' || kind === 'HTTP_200_PARTIAL_GRAPHQL_ERRORS') &&
      response.dataPresent &&
      legacyHistoricalDispatchSucceededV1(response, interpreted)
    ) {
      return { ledgerOutcome: 'SUCCEEDED' };
    }
    if (
      kind === 'HTTP_429' ||
      kind === 'HTTP_5XX' ||
      kind === 'TIMEOUT_OR_NETWORK_UNKNOWN' ||
      kind === 'MALFORMED_RESPONSE' ||
      kind === 'QUERY_FINGERPRINT_MISMATCH' ||
      kind === 'OVERSIZED_RESPONSE' ||
      kind === 'GRAPHQL_ERRORS_NO_DATA'
    ) {
      return { ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' };
    }
    if (kind === 'HTTP_401' || kind === 'HTTP_403' || kind === 'HTTP_400' || kind === 'HTTP_422') {
      return { ledgerOutcome: 'FAILED' };
    }
    return { ledgerOutcome: 'FAILED', stageOutcome: 'UNKNOWN_OUTCOME' };
  }

  const http = response.httpStatus;
  if (http === 422 || http === 400) {
    return { ledgerOutcome: 'FAILED' };
  }
  if (http === 401 || http === 403) {
    return { ledgerOutcome: 'FAILED' };
  }
  if (http === 429 || (typeof http === 'number' && http >= 500)) {
    return { ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' };
  }
  if (legacyHistoricalDispatchSucceededV1(response, interpreted)) {
    return { ledgerOutcome: 'SUCCEEDED' };
  }
  if (http === 200 && !response.dataPresent) {
    return { ledgerOutcome: 'UNKNOWN', stageOutcome: 'UNKNOWN_OUTCOME' };
  }
  return { ledgerOutcome: 'FAILED' };
}
