export const FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1 = 12 * 1024 * 1024;
export const FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1 = 64 * 1024;

/** Strict parse for DIMO_FSD_GRAPHQL_MAX_RESPONSE_BYTES — invalid values fall back safely. */
export function parseDimoFsdGraphqlMaxResponseBytesEnv(
  raw: string | undefined,
  fallback: number = FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
): number {
  const safeFallback = Number.isFinite(fallback) && fallback > 0
    ? fallback
    : FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1;
  if (raw == null || raw.trim() === '') {
    return Math.max(FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1, safeFallback);
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1, safeFallback);
  }
  return Math.max(
    FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1,
    Math.min(Math.floor(parsed), Number.MAX_SAFE_INTEGER),
  );
}
