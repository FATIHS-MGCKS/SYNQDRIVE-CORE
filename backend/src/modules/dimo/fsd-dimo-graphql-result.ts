import type { FsdGraphqlErrorV1 } from './fsd-graphql.types.v1';

/**
 * Classified DIMO telemetry GraphQL outcomes for FSD (P2).
 * Does not replace legacy `queryGraphQL` return shape for existing callers.
 */
export type FsdDimoGraphqlOutcomeKindV1 =
  | 'HTTP_200_OK'
  | 'HTTP_200_PARTIAL_GRAPHQL_ERRORS'
  | 'GRAPHQL_ERRORS_NO_DATA'
  | 'HTTP_400'
  | 'HTTP_422'
  | 'HTTP_401'
  | 'HTTP_403'
  | 'HTTP_429'
  | 'HTTP_5XX'
  | 'TIMEOUT_OR_NETWORK_UNKNOWN'
  | 'MALFORMED_RESPONSE'
  | 'QUERY_FINGERPRINT_MISMATCH'
  | 'OVERSIZED_RESPONSE';

export type FsdDimoGraphqlExecutionResultV1 = {
  kind: FsdDimoGraphqlOutcomeKindV1;
  httpStatus: number | null;
  data: Record<string, unknown> | null;
  errors: readonly FsdGraphqlErrorV1[];
  /** Low-cardinality diagnostic — never includes JWTs or raw payloads. */
  diagnostic?: string;
};
