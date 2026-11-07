import { isAxiosError } from 'axios';

/** Default FSD DIMO GraphQL response cap (12 MiB). */
export const FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1 = 12 * 1024 * 1024;
/** Hard lower bound for configured caps (64 KiB). */
export const FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1 = 64 * 1024;
/** Documented finite upper bound (64 MiB). */
export const FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MAX_V1 = 64 * 1024 * 1024;

/** Decimal positive integer only — rejects fractions, exponents, signs, and partial numeric strings. */
const POSITIVE_INTEGER_DECIMAL_V1 = /^\d+$/;

function clampConfiguredMaxBytes(value: number): number {
  return Math.max(
    FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MIN_V1,
    Math.min(value, FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_MAX_V1),
  );
}

function safeFallbackBytes(fallback: number): number {
  const fb =
    Number.isFinite(fallback) && fallback > 0
      ? fallback
      : FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1;
  return clampConfiguredMaxBytes(fb);
}

/**
 * Strict parse for DIMO_FSD_GRAPHQL_MAX_RESPONSE_BYTES — only whole positive decimal integers;
 * malformed, partial, exponent, overflow, and over-max values fall back safely (then clamped).
 */
export function parseDimoFsdGraphqlMaxResponseBytesEnv(
  raw: string | undefined,
  fallback: number = FSD_DIMO_GRAPHQL_MAX_RESPONSE_BYTES_DEFAULT_V1,
): number {
  const safeFallback = safeFallbackBytes(fallback);
  if (raw == null || raw.trim() === '') {
    return safeFallback;
  }
  const trimmed = raw.trim();
  if (!POSITIVE_INTEGER_DECIMAL_V1.test(trimmed)) {
    return safeFallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return safeFallback;
  }
  return clampConfiguredMaxBytes(parsed);
}

/** True only for Axios transport failures caused by FSD max response byte limits (not generic ERR_BAD_RESPONSE). */
export function isAxiosFsdResponseByteLimitErrorV1(err: unknown): boolean {
  if (!isAxiosError(err)) {
    return false;
  }
  const message = typeof err.message === 'string' ? err.message : '';
  return /maxContentLength|maxBodyLength/i.test(message);
}
