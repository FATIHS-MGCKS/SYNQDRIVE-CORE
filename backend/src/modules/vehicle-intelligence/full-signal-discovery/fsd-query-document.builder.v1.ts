import { createHash } from 'node:crypto';

export type FsdHistoricalWindowV1 = {
  fromUtc: string;
  toUtc: string;
};

export type FsdQueryStageV1 = 'SNAPSHOT' | 'HISTORICAL';

export type FsdPlannedQueryDocumentV1 = {
  stage: FsdQueryStageV1;
  tokenId: number;
  window?: FsdHistoricalWindowV1;
  interval?: string;
  bucketLabelField: string;
  selections: readonly string[];
  fieldNames: readonly string[];
  queryText: string;
  fingerprint: string;
};

function normalizeQueryTextForFingerprint(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function computeFsdQueryFingerprintV1(normalizedQueryText: string): string {
  return createHash('sha256').update(normalizedQueryText, 'utf8').digest('hex');
}

export function buildFsdSignalsLatestQueryDocument(input: {
  tokenId: number;
  selections: readonly string[];
  fieldNames: readonly string[];
  operationName?: string;
}): FsdPlannedQueryDocumentV1 {
  if (!Number.isSafeInteger(input.tokenId) || input.tokenId <= 0) {
    throw new Error('tokenId must be a positive integer');
  }
  const op = input.operationName ?? 'FsdSnapshotDiscovery';
  const body = `
    query ${op} {
      signalsLatest(tokenId: ${input.tokenId}) {
        ${input.selections.join('\n        ')}
      }
    }
  `.trim();
  const normalized = normalizeQueryTextForFingerprint(body);
  return {
    stage: 'SNAPSHOT',
    tokenId: input.tokenId,
    bucketLabelField: 'n/a',
    selections: [...input.selections],
    fieldNames: [...input.fieldNames],
    queryText: body,
    fingerprint: computeFsdQueryFingerprintV1(normalized),
  };
}

export function buildFsdHistoricalSignalsQueryDocument(input: {
  tokenId: number;
  window: FsdHistoricalWindowV1;
  interval?: string;
  bucketLabelField?: string;
  selections: readonly string[];
  fieldNames: readonly string[];
  operationName?: string;
}): FsdPlannedQueryDocumentV1 {
  if (!Number.isSafeInteger(input.tokenId) || input.tokenId <= 0) {
    throw new Error('tokenId must be a positive integer');
  }
  const interval = input.interval ?? '1s';
  const bucketLabelField = input.bucketLabelField ?? 'timestamp';
  const op = input.operationName ?? 'FsdHistoricalDiscovery';
  const body = `
    query ${op} {
      signals(
        tokenId: ${input.tokenId}
        from: "${input.window.fromUtc}"
        to: "${input.window.toUtc}"
        interval: "${interval}"
      ) {
        ${bucketLabelField}
        ${input.selections.join('\n        ')}
      }
    }
  `.trim();
  const normalized = normalizeQueryTextForFingerprint(body);
  return {
    stage: 'HISTORICAL',
    tokenId: input.tokenId,
    window: input.window,
    interval,
    bucketLabelField,
    selections: [...input.selections],
    fieldNames: [...input.fieldNames],
    queryText: body,
    fingerprint: computeFsdQueryFingerprintV1(normalized),
  };
}
