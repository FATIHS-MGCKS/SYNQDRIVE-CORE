import type { FsdBudgetConfigV1 } from './fsd-budget.contract.v1';
import {
  buildFsdHistoricalSignalsQueryDocument,
  buildFsdSignalsLatestQueryDocument,
  type FsdPlannedQueryDocumentV1,
} from './fsd-query-document.builder.v1';

export type FsdChunkSplitReasonV1 = 'HTTP_422' | 'HTTP_400' | 'FAILED_SCHEMA';

export type FsdChunkSplitOutcomeV1 =
  | {
      ok: true;
      parentFingerprint: string;
      childDocuments: FsdPlannedQueryDocumentV1[];
      consumedRequestSlots: number;
    }
  | {
      ok: false;
      reason:
        | 'SINGLE_FIELD_FAILURE'
        | 'IDENTICAL_FINGERPRINT'
        | 'REQUEST_BUDGET_EXCEEDED'
        | 'CANNOT_SPLIT_FURTHER';
      parentFingerprint: string;
    };

function cloneDocumentWithFields(
  parent: FsdPlannedQueryDocumentV1,
  fieldNames: string[],
): FsdPlannedQueryDocumentV1 | null {
  const nameSet = new Set(fieldNames);
  const selections: string[] = [];
  const fields: string[] = [];
  for (let i = 0; i < parent.fieldNames.length; i++) {
    const name = parent.fieldNames[i]!;
    if (nameSet.has(name)) {
      fields.push(name);
      selections.push(parent.selections[i]!);
    }
  }
  if (fields.length === 0) {
    return null;
  }
  fields.sort((a, b) => a.localeCompare(b));
  const orderedSelections = fields.map((f) => {
    const idx = parent.fieldNames.indexOf(f);
    return parent.selections[idx]!;
  });

  if (parent.stage === 'SNAPSHOT') {
    return buildFsdSignalsLatestQueryDocument({
      tokenId: parent.tokenId,
      selections: orderedSelections,
      fieldNames: fields,
    });
  }

  if (!parent.window) {
    return null;
  }
  return buildFsdHistoricalSignalsQueryDocument({
    tokenId: parent.tokenId,
    window: parent.window,
    interval: parent.interval,
    bucketLabelField: parent.bucketLabelField,
    selections: orderedSelections,
    fieldNames: fields,
  });
}

/** Pure split policy — no HTTP execution. Never re-emits an identical rejected fingerprint. */
export function planFsdBinaryChunkSplit(input: {
  failedDocument: FsdPlannedQueryDocumentV1;
  reason: FsdChunkSplitReasonV1;
  remainingRequestBudget: number;
  budget: FsdBudgetConfigV1;
}): FsdChunkSplitOutcomeV1 {
  const failedDocument = input.failedDocument;
  const parentFingerprint = failedDocument.fingerprint;
  const fieldNames = [...failedDocument.fieldNames].sort((a, b) => a.localeCompare(b));

  if (fieldNames.length <= 1) {
    return { ok: false, reason: 'SINGLE_FIELD_FAILURE', parentFingerprint };
  }

  const mid = Math.ceil(fieldNames.length / 2);
  const left = fieldNames.slice(0, mid);
  const right = fieldNames.slice(mid);

  const childDocuments: FsdPlannedQueryDocumentV1[] = [];
  const leftDoc = cloneDocumentWithFields(failedDocument, left);
  const rightDoc = cloneDocumentWithFields(failedDocument, right);
  if (!leftDoc || !rightDoc) {
    return { ok: false, reason: 'CANNOT_SPLIT_FURTHER', parentFingerprint };
  }

  for (const doc of [leftDoc, rightDoc]) {
    if (doc.fingerprint === parentFingerprint) {
      return { ok: false, reason: 'IDENTICAL_FINGERPRINT', parentFingerprint };
    }
    childDocuments.push(doc);
  }

  const consumedRequestSlots = childDocuments.length;
  if (consumedRequestSlots > input.remainingRequestBudget) {
    return { ok: false, reason: 'REQUEST_BUDGET_EXCEEDED', parentFingerprint };
  }

  if (consumedRequestSlots > input.budget.maxRequestsPerRun) {
    return { ok: false, reason: 'REQUEST_BUDGET_EXCEEDED', parentFingerprint };
  }

  void input.reason;
  return {
    ok: true,
    parentFingerprint,
    childDocuments,
    consumedRequestSlots,
  };
}

export function assertRejectedFingerprintNotRetried(
  rejectedFingerprint: string,
  candidateFingerprint: string,
): boolean {
  return rejectedFingerprint !== candidateFingerprint;
}

