import type { OneAutoProviderResponse } from '@prisma/client';
import { extractOeServiceHistoryEuProviderResult } from './oneauto-service-history-eu-provider.util';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapNestedEnvelope(body: unknown): Record<string, unknown> | null {
  if (!isPlainObject(body)) return null;
  const direct = extractOeServiceHistoryEuProviderResult(body);
  if (direct) return direct;
  const inner = body.result;
  if (isPlainObject(inner)) {
    const nested = extractOeServiceHistoryEuProviderResult(inner);
    if (nested) return nested;
  }
  return null;
}

export type PersistedOeServiceHistoryEuSuccessPayload = {
  responseId: string;
  fetchedAt: Date;
  httpStatus: number | null;
  providerResult: Record<string, unknown>;
};

export function pickPersistedOeServiceHistoryEuSuccessPayload(
  responses: Pick<OneAutoProviderResponse, 'id' | 'fetchedAt' | 'httpStatus' | 'responseBodyJson'>[],
): PersistedOeServiceHistoryEuSuccessPayload | null {
  const sorted = [...responses].sort(
    (a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime(),
  );
  for (const row of sorted) {
    const providerResult = unwrapNestedEnvelope(row.responseBodyJson);
    if (!providerResult) continue;
    return {
      responseId: row.id,
      fetchedAt: row.fetchedAt,
      httpStatus: row.httpStatus,
      providerResult,
    };
  }
  return null;
}
