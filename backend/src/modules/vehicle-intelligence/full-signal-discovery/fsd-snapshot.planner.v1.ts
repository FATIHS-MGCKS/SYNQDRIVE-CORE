import {
  type FsdBudgetConfigV1,
  resolveMaxSnapshotDocumentsFromRemainingBudget,
  sanitizeNonNegativeRequestBudget,
} from './fsd-budget.contract.v1';
import type { FsdUnsupportedPlanningReasonV1 } from './fsd-evidence.contract.v1';
import { createPlannerStageEvidenceDimensions } from './fsd-evidence.contract.v1';
import { normalizeDeclaredFieldNames } from './fsd-graphql-field.util.v1';
import {
  buildFsdSignalsLatestQueryDocument,
  type FsdPlannedQueryDocumentV1,
} from './fsd-query-document.builder.v1';
import {
  buildFsdSnapshotSelectionForSignal,
} from './fsd-selection.builder.v1';
import {
  classifyDeclaredFsdSignals,
  type FsdClassifiedSignalV1,
} from './fsd-signal-shape.classifier.v1';

export type FsdSnapshotSignalPlanV1 = {
  fieldName: string;
  classified: FsdClassifiedSignalV1;
  evidence: ReturnType<typeof createPlannerStageEvidenceDimensions>;
  unsupportedReason?: FsdUnsupportedPlanningReasonV1;
};

export type FsdSnapshotPlanV1 = {
  documents: FsdPlannedQueryDocumentV1[];
  catalogSignals: FsdSnapshotSignalPlanV1[];
  deferredSignals: FsdSnapshotSignalPlanV1[];
};

function chunkFields<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0 || chunkSize <= 0) {
    return [];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function markSnapshotSignalDeferred(entry: FsdSnapshotSignalPlanV1): FsdSnapshotSignalPlanV1 {
  return {
    ...entry,
    evidence: createPlannerStageEvidenceDimensions({
      declared: true,
      schemaCompatible: entry.classified.shape !== 'UNKNOWN',
      queryPlanned: false,
      notEvaluable: true,
    }),
    unsupportedReason: 'DEFERRED_BY_REQUEST_BUDGET',
  };
}

export function planFsdSnapshotQueries(input: {
  tokenId: number;
  declaredFieldNames: readonly string[];
  budget: FsdBudgetConfigV1;
  /** Max executable snapshot GraphQL documents allowed (remaining run budget slots). */
  maxSnapshotDocuments?: number;
}): FsdSnapshotPlanV1 {
  const normalized = normalizeDeclaredFieldNames(input.declaredFieldNames);
  const classified = classifyDeclaredFsdSignals(normalized);
  const fieldsPerDocument = Math.max(1, input.budget.maxSnapshotFieldsPerDocument);

  const plannable: Array<{
    signal: FsdClassifiedSignalV1;
    selection: string;
    catalogEntry: FsdSnapshotSignalPlanV1;
  }> = [];
  const catalogSignals: FsdSnapshotSignalPlanV1[] = [];
  const deferredSignals: FsdSnapshotSignalPlanV1[] = [];

  for (const signal of classified) {
    const selection = buildFsdSnapshotSelectionForSignal(signal);
    const schemaCompatible = signal.shape !== 'UNKNOWN';
    if (!selection) {
      catalogSignals.push({
        fieldName: signal.fieldName,
        classified: signal,
        evidence: createPlannerStageEvidenceDimensions({
          declared: true,
          schemaCompatible,
          queryPlanned: false,
          notEvaluable: true,
        }),
        unsupportedReason:
          signal.shape === 'UNKNOWN'
            ? 'UNKNOWN_SHAPE_NOT_PLANNED_IN_FSD1'
            : 'NOT_DECLARED',
      });
      continue;
    }

    const catalogEntry: FsdSnapshotSignalPlanV1 = {
      fieldName: signal.fieldName,
      classified: signal,
      evidence: createPlannerStageEvidenceDimensions({
        declared: true,
        schemaCompatible,
        queryPlanned: true,
        notEvaluable: false,
      }),
    };
    catalogSignals.push(catalogEntry);
    plannable.push({ signal, selection, catalogEntry });
  }

  const maxDocsFromBudget = resolveMaxSnapshotDocumentsFromRemainingBudget(
    input.maxSnapshotDocuments ?? input.budget.maxRequestsPerRun,
  );
  const maxDocsByFieldCapacity =
    plannable.length === 0 ? 0 : Math.ceil(plannable.length / fieldsPerDocument);
  const maxDocs = Math.min(maxDocsByFieldCapacity, maxDocsFromBudget);

  const maxPlannableFields =
    maxDocs > 0 ? maxDocs * fieldsPerDocument : 0;

  const toPlan = plannable.slice(0, maxPlannableFields);
  const overflow = plannable.slice(maxPlannableFields);

  const deferredFieldNames = new Set<string>();
  for (const item of overflow) {
    deferredFieldNames.add(item.signal.fieldName);
    deferredSignals.push(markSnapshotSignalDeferred(item.catalogEntry));
  }

  const catalogSignalsAdjusted = catalogSignals.map((entry) =>
    deferredFieldNames.has(entry.fieldName) ? markSnapshotSignalDeferred(entry) : entry,
  );

  const documents: FsdPlannedQueryDocumentV1[] = [];
  for (const group of chunkFields(toPlan, fieldsPerDocument)) {
    const selections = group.map((g) => g.selection);
    const fieldNames = group.map((g) => g.signal.fieldName);
    documents.push(
      buildFsdSignalsLatestQueryDocument({
        tokenId: input.tokenId,
        selections,
        fieldNames,
      }),
    );
  }

  const maxDocsSanity = sanitizeNonNegativeRequestBudget(maxDocsFromBudget);
  if (documents.length > maxDocsSanity) {
    throw new Error('FSD snapshot planner produced more documents than budget allows');
  }

  return { documents, catalogSignals: catalogSignalsAdjusted, deferredSignals };
}
